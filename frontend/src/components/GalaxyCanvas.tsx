import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Billboard, OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'
import type { GraphNote, GraphRelationship } from '../types'
import { createGalaxyLayout, createNeighborMap, nodeColor, nodeRadius } from '../galaxy/layout'

interface GalaxyCanvasProps {
  notes: GraphNote[]
  edges: GraphRelationship[]
  selectedId: string | null
  hoveredId: string | null
  highlightIds: string[] | null
  pathIds: string[] | null
  pathPulseKey: number
  visualEvent: { key: number; kind: 'create' | 'delete' | 'relationship'; noteId?: string; sourceId?: string; targetId?: string; position?: [number, number, number] } | null
  onVisualEventComplete: (key: number) => void
  onSelect: (note: GraphNote) => void
  onHover: (id: string | null) => void
}

function hashText(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const nodeSphereGeometry = new THREE.SphereGeometry(1, 16, 16)
const nodeCoronaGeometry = new THREE.TorusGeometry(1, 0.026, 4, 40)
const knownNodeTypes = new Set(['CONCEPT', 'RESOURCE', 'QUESTION', 'SUMMARY'])
const fallbackNodeColors = ['#e5dbc5', '#a9c0cc', '#d6b16f', '#c99584']
const flowTrailOffsets = [0, 0.018, 0.038] as const
const idleGlowColor = new THREE.Color('#594526')
const activeGlowColor = new THREE.Color('#f5d48f')
const pathGlowColor = new THREE.Color('#d4e7ec')
const idlePulseCoreColor = new THREE.Color('#8c754c')
const activePulseCoreColor = new THREE.Color('#fff1d2')
const pathPulseCoreColor = new THREE.Color('#e4f0f0')
const pulseColorScratch = new THREE.Color()

function createNodeHaloTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) return new THREE.Texture()
  const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,248,228,0.34)')
  gradient.addColorStop(0.2, 'rgba(255,229,178,0.13)')
  gradient.addColorStop(0.55, 'rgba(246,202,134,0.035)')
  gradient.addColorStop(1, 'rgba(246,202,134,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function compactNodeTitle(title: string) {
  const singleLine = title.replace(/\s+/g, ' ').trim()
  return singleLine.length > 30 ? `${singleLine.slice(0, 27).trimEnd()}…` : singleLine
}

type FloatingTextMesh = THREE.Mesh & { fillOpacity: number; outlineOpacity: number }
type NodeRevealTimeline = { startedAt: number }

const NODE_REVEAL_DELAY_MS = 180
const NODE_REVEAL_DURATION_MS = 760
const NODE_REVEAL_STAGGER_MS = 3.5

function getNodeRevealOpacity(timeline: NodeRevealTimeline, index: number, now: number) {
  const progress = THREE.MathUtils.clamp(
    (now - timeline.startedAt - index * NODE_REVEAL_STAGGER_MS) / NODE_REVEAL_DURATION_MS,
    0,
    1,
  )
  return progress * progress * (3 - 2 * progress)
}

function NodeLabel({ title, offset, hovered, selected, onPath, revealOpacity }: {
  title: string; offset: number; hovered: boolean; selected: boolean; onPath: boolean
  revealOpacity: MutableRefObject<number>
}) {
  const label = useRef<FloatingTextMesh>(null)
  const worldPosition = useRef(new THREE.Vector3())

  useFrame(({ camera }, delta) => {
    const text = label.current
    if (!text) return
    text.getWorldPosition(worldPosition.current)
    const distance = camera.position.distanceTo(worldPosition.current)
    const distanceFade = 1 - THREE.MathUtils.smoothstep(distance, 28, 42)
    const emphasis = selected ? 1 : hovered ? 0.86 : onPath ? 0.72 : 0
    const visibility = emphasis > 0 ? Math.max(distanceFade, 0.78) : distanceFade
    const targetOpacity = (0.3 + emphasis * 0.68) * visibility
    const targetOutline = (0.11 + emphasis * 0.3) * visibility
    const targetScale = 1 + emphasis * 0.08
    text.fillOpacity = THREE.MathUtils.damp(text.fillOpacity, targetOpacity, 8, delta) * revealOpacity.current
    text.outlineOpacity = THREE.MathUtils.damp(text.outlineOpacity, targetOutline, 8, delta) * revealOpacity.current
    text.scale.setScalar(THREE.MathUtils.damp(text.scale.x, targetScale, 8, delta))
  })

  return <Billboard position={[0, offset, 0]} follow raycast={() => null}>
    <Text
      ref={label}
      fontSize={0.14}
      color="#e6decb"
      anchorX="center"
      anchorY="bottom"
      textAlign="center"
      whiteSpace="nowrap"
      maxWidth={3.2}
      fillOpacity={0}
      outlineWidth={0.018}
      outlineBlur={0.012}
      outlineColor="#d6b875"
      outlineOpacity={0}
      depthOffset={-1}
      raycast={() => null}
    >
      {compactNodeTitle(title)}
    </Text>
  </Billboard>
}

function NoteNode({ note, position, active, dimmed, hovered, selected, prominent, onPath, haloTexture, arrivalUntil, revealTimeline, revealIndex, onSelect, onHover }: {
  note: GraphNote; position: [number, number, number]; active: boolean; dimmed: boolean
  hovered: boolean; selected: boolean; prominent: boolean; onPath: boolean; haloTexture: THREE.Texture
  arrivalUntil: Map<string, number>; revealTimeline: MutableRefObject<NodeRevealTimeline>; revealIndex: number
  onSelect: () => void; onHover: (id: string | null) => void
}) {
  const group = useRef<THREE.Group>(null)
  const coreMaterial = useRef<THREE.MeshStandardMaterial>(null)
  const haloMaterial = useRef<THREE.SpriteMaterial>(null)
  const surfaceMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const coronaMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const revealOpacity = useRef(0)
  const reducedMotion = useRef(false)
  const seed = hashText(note.id)
  const phase = ((seed >>> 8) % 1000) / 1000 * Math.PI * 2
  const sizeVariation = 0.9 + (seed % 201) / 1000
  const radius = nodeRadius(note.importance) * sizeVariation
  const typeKey = note.type.toUpperCase()
  const typeTint = knownNodeTypes.has(typeKey) ? nodeColor(note.type) : fallbackNodeColors[seed % fallbackNodeColors.length]
  const coreColor = useMemo(() => new THREE.Color(typeTint).lerp(new THREE.Color('#fff5df'), selected ? 0.09 : 0), [selected, typeTint])
  const bodyScale = selected ? 1.7 : prominent ? 1.8 : 1.62
  const selectedRadius = radius * bodyScale

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotion.current = preference.matches }
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  useFrame((state, delta) => {
    if (!group.current) return
    revealOpacity.current = reducedMotion.current ? 1 : getNodeRevealOpacity(revealTimeline.current, revealIndex, performance.now())
    const target = selected ? 1.2 : active ? 1.12 : 1
    const breath = reducedMotion.current ? 1 : 0.97 + Math.sin(state.clock.elapsedTime * 1.15 + phase) * 0.025
    group.current.scale.setScalar(THREE.MathUtils.damp(group.current.scale.x, target * breath, 7, delta))
    if (coreMaterial.current) {
      const shimmer = reducedMotion.current ? 0 : Math.sin(state.clock.elapsedTime * 1.35 + phase) * 0.035
      coreMaterial.current.opacity = ((dimmed ? 0.48 : 0.98) + shimmer) * revealOpacity.current
      const baseEmission = dimmed ? 0.12 : selected ? 0.72 : prominent ? 0.34 : active ? 0.3 : 0.2
      const brightnessVariation = 0.9 + ((seed >>> 20) % 201) / 1000
      const arrivalProgress = THREE.MathUtils.clamp(((arrivalUntil.get(note.id) ?? 0) - state.clock.elapsedTime) / 0.28, 0, 1)
      const arrivalResponse = arrivalProgress * arrivalProgress * (3 - 2 * arrivalProgress)
      coreMaterial.current.emissiveIntensity = (baseEmission * brightnessVariation + shimmer * 2 + arrivalResponse * 0.26) * revealOpacity.current
    }
    if (haloMaterial.current) {
      const shimmer = reducedMotion.current ? 0 : Math.sin(state.clock.elapsedTime * 0.9 + phase) * 0.018
      haloMaterial.current.opacity = ((dimmed ? 0.025 : selected ? 0.24 : prominent ? 0.15 : 0.1) + shimmer) * revealOpacity.current
    }
    if (surfaceMaterial.current) surfaceMaterial.current.opacity = (selected ? 0.96 : prominent ? 0.88 : 0.78) * revealOpacity.current
    if (coronaMaterial.current) coronaMaterial.current.opacity = (dimmed ? 0.06 : prominent ? 0.2 : 0.15) * revealOpacity.current
  })
  return (
    <group ref={group} position={position}>
      <mesh
        scale={Math.max(0.34, radius * 2.1)}
        onClick={(event) => { event.stopPropagation(); onSelect() }}
        onPointerOver={(event) => { event.stopPropagation(); onHover(note.id); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { onHover(null); document.body.style.cursor = 'auto' }}
      >
        <primitive object={nodeSphereGeometry} attach="geometry" />
        <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
      </mesh>
      <sprite scale={[radius * (selected ? 4.4 : prominent ? 3.8 : 3.5), radius * (selected ? 4.4 : prominent ? 3.8 : 3.5), 1]} raycast={() => null}>
        <spriteMaterial ref={haloMaterial} map={haloTexture} color={typeTint} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      <mesh scale={selectedRadius} raycast={() => null}>
        <primitive object={nodeSphereGeometry} attach="geometry" />
        <meshStandardMaterial ref={coreMaterial} color={coreColor} emissive={coreColor} emissiveIntensity={0} roughness={0.34} metalness={0.08} transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh scale={selectedRadius * 0.3} raycast={() => null}>
        <primitive object={nodeSphereGeometry} attach="geometry" />
        <meshBasicMaterial ref={surfaceMaterial} color={selected ? '#fff8e9' : '#fff3d7'} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
      {(prominent || active) && !selected && <mesh scale={radius * 1.48} rotation={[Math.PI / 2.25, 0, 0]} raycast={() => null}>
        <primitive object={nodeCoronaGeometry} attach="geometry" />
        <meshBasicMaterial ref={coronaMaterial} color={prominent ? '#e7c483' : typeTint} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>}
      {selected && <NodeCorona radius={selectedRadius} seed={note.id} revealOpacity={revealOpacity} />}
      <NodeLabel title={note.title} offset={radius * (selected ? 2.7 : 2.4) + 0.08} hovered={hovered} selected={selected} onPath={onPath} revealOpacity={revealOpacity} />
    </group>
  )
}

function NodeCorona({ radius, seed, revealOpacity }: { radius: number; seed: string; revealOpacity: MutableRefObject<number> }) {
  const electrons = useRef<Array<THREE.Mesh | null>>([])
  const orbitLineMaterials = useRef<Array<THREE.LineBasicMaterial | null>>([])
  const electronMaterials = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const reducedMotion = useRef(false)
  const orbits = useMemo(() => {
    const random = createRandom(hashText(seed))
    return [
      { rx: 1.72, ry: 1.02, tilt: new THREE.Euler(0.48, 0.18, 0.12), color: '#e8d5ad' },
      { rx: 1.94, ry: 0.78, tilt: new THREE.Euler(1.05, 0.82, 0.34), color: '#f0e5cb' },
      { rx: 1.58, ry: 0.88, tilt: new THREE.Euler(0.22, 1.68, 0.92), color: '#cbd9dc' },
    ].map((definition, index) => {
      const axisU = new THREE.Vector3(1, 0, 0).applyEuler(definition.tilt)
      const axisV = new THREE.Vector3(0, 1, 0).applyEuler(definition.tilt)
      const curve = new THREE.EllipseCurve(0, 0, radius * definition.rx, radius * definition.ry, 0, Math.PI * 2, false, 0)
      const points = curve.getPoints(96)
      const values = new Float32Array(points.length * 3)
      points.forEach((point, pointIndex) => {
        const offset = pointIndex * 3
        values[offset] = axisU.x * point.x + axisV.x * point.y
        values[offset + 1] = axisU.y * point.x + axisV.y * point.y
        values[offset + 2] = axisU.z * point.x + axisV.z * point.y
      })
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(values, 3))
      return {
        geometry, axisU, axisV, rx: radius * definition.rx, ry: radius * definition.ry,
        color: definition.color, speed: 0.44 + random() * 0.24, phase: random() * Math.PI * 2,
        direction: index % 2 === 0 ? 1 : -1,
      }
    })
  }, [radius, seed])

  useEffect(() => () => orbits.forEach((orbit) => orbit.geometry.dispose()), [orbits])
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotion.current = preference.matches }
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  useFrame((state) => {
    const elapsed = reducedMotion.current ? 0 : state.clock.elapsedTime
    for (let index = 0; index < orbits.length; index += 1) {
      const orbit = orbits[index]
      const electron = electrons.current[index]
      const reveal = revealOpacity.current
      if (orbitLineMaterials.current[index]) orbitLineMaterials.current[index]!.opacity = 0.18 * reveal
      if (electronMaterials.current[index]) electronMaterials.current[index]!.opacity = 0.82 * reveal
      if (!electron) continue
      const angle = orbit.phase + elapsed * orbit.speed * orbit.direction
      const x = Math.cos(angle) * orbit.rx
      const y = Math.sin(angle) * orbit.ry
      electron.position.set(
        orbit.axisU.x * x + orbit.axisV.x * y,
        orbit.axisU.y * x + orbit.axisV.y * y,
        orbit.axisU.z * x + orbit.axisV.z * y,
      )
    }
  })

  return <group raycast={() => null}>
    {orbits.map((orbit, index) => <group key={index} raycast={() => null}>
      <lineLoop geometry={orbit.geometry} raycast={() => null}>
        <lineBasicMaterial ref={(material) => { orbitLineMaterials.current[index] = material }} color={orbit.color} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </lineLoop>
      <mesh ref={(mesh) => { electrons.current[index] = mesh }} scale={radius * 0.075} raycast={() => null}>
        <primitive object={nodeSphereGeometry} attach="geometry" />
        <meshBasicMaterial ref={(material) => { electronMaterials.current[index] = material }} color={orbit.color} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>)}
  </group>
}

function CameraFocus({ focus }: { focus: [number, number, number] | null }) {
  const controls = useRef<any>(null)
  const transition = useRef<{
    fromTarget: THREE.Vector3; toTarget: THREE.Vector3
    fromPosition: THREE.Vector3; toPosition: THREE.Vector3; startedAt: number
  } | null>(null)
  useEffect(() => {
    const control = controls.current
    if (!control) return
    // Deselecting returns to the galaxy by restoring its normal emphasis; preserve the
    // user's current orbit target and zoom instead of pulling the camera to the origin.
    if (!focus) { transition.current = null; return }

    const fromTarget = control.target.clone()
    const toTarget = focus ? new THREE.Vector3(...focus) : new THREE.Vector3()
    const fromPosition = control.object.position.clone()
    const cameraOffset = fromPosition.clone().sub(fromTarget)
    const toPosition = toTarget.clone().add(cameraOffset)
    transition.current = { fromTarget, toTarget, fromPosition, toPosition, startedAt: performance.now() }
  }, [focus])

  useEffect(() => {
    const control = controls.current
    if (!control) return
    const stopFocusForManualOrbit = () => { transition.current = null }
    control.addEventListener('start', stopFocusForManualOrbit)
    return () => control.removeEventListener('start', stopFocusForManualOrbit)
  }, [])

  useFrame(() => {
    const control = controls.current
    const movement = transition.current
    if (!control || !movement) return
    const linear = Math.min(1, (performance.now() - movement.startedAt) / 850)
    const eased = linear * linear * (3 - 2 * linear)
    control.target.lerpVectors(movement.fromTarget, movement.toTarget, eased)
    control.object.position.lerpVectors(movement.fromPosition, movement.toPosition, eased)
    control.update()
    if (linear >= 1) transition.current = null
  })
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.075} minDistance={5} maxDistance={48} rotateSpeed={0.55} />
}

function GraphMutationEffect({ event, position, target, onComplete }: {
  event: NonNullable<GalaxyCanvasProps['visualEvent']>; position: [number, number, number]
  target?: [number, number, number]; onComplete: (key: number) => void
}) {
  const root = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const ringMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const flash = useRef<THREE.Mesh>(null)
  const flashMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const spark = useRef<THREE.Mesh>(null)
  const sparkMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const elapsed = useRef(0)
  const completed = useRef(false)
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const duration = reducedMotion ? 0.24 : event.kind === 'delete' ? 0.72 : event.kind === 'relationship' ? 1.05 : 0.92
  const connection = useMemo(() => target ? new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(...position),
    new THREE.Vector3(...position).lerp(new THREE.Vector3(...target), 0.5).add(new THREE.Vector3(0, 0.22, 0)),
    new THREE.Vector3(...target),
  ) : null, [position, target])
  const particles = useMemo(() => Array.from({ length: reducedMotion ? 0 : 9 }, (_, index) => {
    const angle = (index / 9) * Math.PI * 2 + event.key * 0.001
    return new THREE.Vector3(Math.cos(angle), Math.sin(angle * 1.7), Math.sin(angle))
  }), [event.key, reducedMotion])
  const particleGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(particles.length * 3), 3))
    return geometry
  }, [particles])
  useEffect(() => () => particleGeometry.dispose(), [particleGeometry])

  useFrame((_, delta) => {
    elapsed.current += Math.min(delta, 0.05)
    const progress = Math.min(1, elapsed.current / duration)
    const eased = progress * progress * (3 - 2 * progress)
    if (event.kind === 'relationship' && connection && spark.current && sparkMaterial.current) {
      spark.current.position.copy(connection.getPoint(eased))
      sparkMaterial.current.opacity = Math.sin(Math.PI * progress) * (reducedMotion ? 0 : 0.9)
    }
    if (event.kind !== 'relationship') {
      const expansion = event.kind === 'delete' ? 1 - eased : eased
      if (ring.current) ring.current.scale.setScalar(0.15 + expansion * (reducedMotion ? 1.2 : 4.4))
      if (ringMaterial.current) ringMaterial.current.opacity = (event.kind === 'delete' ? 0.22 : 0.3) * (1 - progress)
      if (flash.current) flash.current.scale.setScalar(event.kind === 'delete' ? 1 - eased * 0.92 : 0.35 + eased * 0.9)
      if (flashMaterial.current) flashMaterial.current.opacity = (event.kind === 'delete' ? 0.42 : 0.72) * (1 - progress)
      const attribute = particleGeometry.getAttribute('position') as THREE.BufferAttribute
      for (let index = 0; index < particles.length; index += 1) {
        const direction = particles[index]
        const distance = event.kind === 'delete' ? 1.25 * (1 - eased) : eased * 1.35
        attribute.setXYZ(index, direction.x * distance, direction.y * distance, direction.z * distance)
      }
      attribute.needsUpdate = true
    }
    if (progress >= 1 && !completed.current) {
      completed.current = true
      onComplete(event.key)
    }
  })

  if (event.kind === 'relationship') return connection ? <group raycast={() => null}>
    <mesh raycast={() => null}>
      <tubeGeometry args={[connection, 36, 0.018, 5, false]} />
      <meshBasicMaterial color="#e8bb73" transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
    <mesh ref={spark} position={position} raycast={() => null}><sphereGeometry args={[0.075, 8, 8]} /><meshBasicMaterial ref={sparkMaterial} color="#fff0cf" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
  </group> : null

  return <group ref={root} position={position} raycast={() => null}>
    <mesh ref={ring} raycast={() => null}><torusGeometry args={[0.45, 0.012, 5, 48]} /><meshBasicMaterial ref={ringMaterial} color={event.kind === 'delete' ? '#c8ad87' : '#f0d59d'} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
    <mesh ref={flash} raycast={() => null}><sphereGeometry args={[0.12, 10, 10]} /><meshBasicMaterial ref={flashMaterial} color="#fff0d2" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
    {particles.length > 0 && <points geometry={particleGeometry} raycast={() => null}><pointsMaterial color={event.kind === 'delete' ? '#d2c2a9' : '#f4d69d'} size={2.4} sizeAttenuation={false} transparent opacity={0.78} depthWrite={false} toneMapped={false} /></points>}
  </group>
}

function createRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 4294967296
  }
}

function createStarGeometry(count: number, radius: number, seed: number, clustered: boolean) {
  const random = createRandom(seed)
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const clusters = Array.from({ length: 9 }, () => {
    const z = random() * 2 - 1
    const angle = random() * Math.PI * 2
    const planar = Math.sqrt(1 - z * z)
    return new THREE.Vector3(planar * Math.cos(angle), z, planar * Math.sin(angle))
  })
  const palette = [new THREE.Color('#d9d6ce'), new THREE.Color('#b6c4d1'), new THREE.Color('#dfbd88'), new THREE.Color('#bd8b79')]
  for (let index = 0; index < count; index += 1) {
    let direction: THREE.Vector3
    if (clustered && random() < 0.42) {
      const center = clusters[Math.floor(random() * clusters.length)]
      direction = center.clone().add(new THREE.Vector3((random() - 0.5) * 0.34, (random() - 0.5) * 0.34, (random() - 0.5) * 0.34)).normalize()
    } else {
      const z = random() * 2 - 1
      const angle = random() * Math.PI * 2
      const planar = Math.sqrt(1 - z * z)
      direction = new THREE.Vector3(planar * Math.cos(angle), z, planar * Math.sin(angle))
    }
    const distance = radius * (0.86 + random() * 0.14)
    positions.set([direction.x * distance, direction.y * distance, direction.z * distance], index * 3)
    const color = palette[Math.floor(random() * palette.length)].clone().multiplyScalar(0.8 + random() * 0.65)
    colors.set([color.r, color.g, color.b], index * 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

function StarField() {
  const distant = useMemo(() => createStarGeometry(1450, 88, 0x5a17, true), [])
  const middle = useMemo(() => createStarGeometry(420, 61, 0x71b3, true), [])
  const foreground = useMemo(() => createStarGeometry(72, 43, 0x10ac, false), [])
  useEffect(() => () => { distant.dispose(); middle.dispose(); foreground.dispose() }, [distant, middle, foreground])
  return <group>
    <points geometry={distant} frustumCulled={false}><pointsMaterial size={1.5} vertexColors transparent opacity={0.66} sizeAttenuation={false} depthWrite={false} toneMapped={false} fog={false} /></points>
    <points geometry={middle} frustumCulled={false}><pointsMaterial size={2} vertexColors transparent opacity={0.72} sizeAttenuation={false} depthWrite={false} toneMapped={false} fog={false} /></points>
    <points geometry={foreground} frustumCulled={false}><pointsMaterial size={2.8} vertexColors transparent opacity={0.82} sizeAttenuation={false} depthWrite={false} toneMapped={false} fog={false} /></points>
  </group>
}

function createGalaxyAtlas(seed: number) {
  const columns = 8
  const rows = 8
  const tileSize = 128
  const canvas = document.createElement('canvas')
  canvas.width = columns * tileSize
  canvas.height = rows * tileSize
  const context = canvas.getContext('2d')
  if (!context) return new THREE.CanvasTexture(canvas)

  const random = createRandom(seed)
  const colors = [
    [226, 217, 195],
    [210, 184, 137],
    [194, 207, 213],
    [219, 207, 184],
    [181, 190, 195],
  ]
  const rgba = (color: number[], alpha: number) => `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`

  for (let index = 0; index < columns * rows; index += 1) {
    const originX = index % columns * tileSize
    const originY = Math.floor(index / columns) * tileSize
    const color = colors[Math.floor(random() * colors.length)]
    const type = Math.floor(random() * 3)
    const rotation = random() * Math.PI * 2
    const squash = 0.62 + random() * 0.3
    context.save()
    context.beginPath()
    context.rect(originX, originY, tileSize, tileSize)
    context.clip()
    context.translate(originX + tileSize / 2, originY + tileSize / 2)
    context.rotate(rotation)

    if (type === 2) {
      const blobCount = 4 + Math.floor(random() * 4)
      for (let blob = 0; blob < blobCount; blob += 1) {
        const x = (random() - 0.5) * 46
        const y = (random() - 0.5) * 40
        const radius = 12 + random() * 18
        const cloud = context.createRadialGradient(x, y, 1, x, y, radius)
        cloud.addColorStop(0, rgba(color, 0.32 + random() * 0.18))
        cloud.addColorStop(0.48, rgba(color, 0.14))
        cloud.addColorStop(1, rgba(color, 0))
        context.fillStyle = cloud
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
      }
    } else {
      context.save()
      context.scale(1, squash)
      const halo = context.createRadialGradient(0, 0, 2, 0, 0, 56)
      halo.addColorStop(0, rgba(color, 0.56))
      halo.addColorStop(0.12, rgba(color, 0.36))
      halo.addColorStop(0.42, rgba(color, 0.15))
      halo.addColorStop(0.76, rgba(color, 0.045))
      halo.addColorStop(1, rgba(color, 0))
      context.fillStyle = halo
      context.beginPath()
      context.ellipse(0, 0, 56, 52, 0, 0, Math.PI * 2)
      context.fill()

      if (type === 0) {
        context.shadowColor = rgba(color, 0.55)
        context.shadowBlur = 8 + random() * 5
        context.lineWidth = 1.6 + random() * 1.4
        context.lineCap = 'round'
        context.strokeStyle = rgba(color, 0.52)
        for (let arm = 0; arm < 2; arm += 1) {
          context.beginPath()
          for (let step = 0; step <= 150; step += 1) {
            const progress = step / 150
            const angle = progress * Math.PI * 4.2 + arm * Math.PI + random() * 0.0008
            const radius = 4 + progress * (40 + random() * 0.02)
            const x = Math.cos(angle) * radius
            const y = Math.sin(angle) * radius
            if (step === 0) context.moveTo(x, y)
            else context.lineTo(x, y)
          }
          context.stroke()
        }
      }
      context.restore()
    }

    const core = context.createRadialGradient(-2, -2, 0, 0, 0, 17 + random() * 5)
    core.addColorStop(0, rgba([246, 238, 217], type === 2 ? 0.28 : 0.38))
    core.addColorStop(0.28, rgba(color, 0.2))
    core.addColorStop(1, rgba(color, 0))
    context.fillStyle = core
    context.fillRect(-24, -24, 48, 48)
    context.restore()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  return texture
}

function createGalaxyInstances(count: number, seed: number) {
  const random = createRandom(seed)
  const centers = new Float32Array(count * 3)
  const diameters = new Float32Array(count)
  const opacities = new Float32Array(count)
  const uvRects = new Float32Array(count * 4)
  const tints = new Float32Array(count * 3)
  const columns = 8
  const rows = 8
  const tileScale = 1 / columns
  const focalPixels = 900 / (2 * Math.tan(48 * Math.PI / 360))
  const referenceViewDirection = new THREE.Vector3(0, -4, -18).normalize()
  const referenceCameraPosition = new THREE.Vector3(0, 4, 18)

  for (let index = 0; index < count; index += 1) {
    const z = random() * 2 - 1
    const angle = random() * Math.PI * 2
    const planar = Math.sqrt(1 - z * z)
    const distance = 145 + Math.pow(random(), 0.72) * 285
    const directionX = planar * Math.cos(angle)
    const directionY = z
    const directionZ = planar * Math.sin(angle)
    const drift = (random() - 0.5) * 12
    const center = new THREE.Vector3(
      directionX * distance + (random() - 0.5) * 9,
      directionY * distance + drift,
      directionZ * distance + (random() - 0.5) * 9,
    )
    centers.set([center.x, center.y, center.z], index * 3)

    const sizeClass = random()
    let screenDiameter: number
    if (sizeClass < 0.56) {
      screenDiameter = 12 + random() * 10
      opacities[index] = 0.3 + random() * 0.2
    } else if (sizeClass < 0.87) {
      screenDiameter = 25 + random() * 20
      opacities[index] = 0.34 + random() * 0.2
    } else if (sizeClass < 0.984) {
      screenDiameter = 50 + random() * 40
      opacities[index] = 0.32 + random() * 0.19
    } else {
      screenDiameter = 100 + random() * 50
      opacities[index] = 0.28 + random() * 0.18
    }
    const viewDepth = center.clone().sub(referenceCameraPosition).dot(referenceViewDirection)
    const referenceDepth = Math.max(90, viewDepth)
    diameters[index] = screenDiameter * referenceDepth / focalPixels

    const tile = Math.floor(random() * columns * rows)
    const column = tile % columns
    const row = Math.floor(tile / columns)
    uvRects.set([column * tileScale, 1 - (row + 1) * tileScale, tileScale, tileScale], index * 4)
    const tint = 0.82 + random() * 0.24
    tints.set([tint, tint * (0.98 + random() * 0.04), tint * (0.96 + random() * 0.06)], index * 3)
  }

  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
  ], 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  geometry.instanceCount = count
  geometry.setAttribute('aCenter', new THREE.InstancedBufferAttribute(centers, 3))
  geometry.setAttribute('aDiameter', new THREE.InstancedBufferAttribute(diameters, 1))
  geometry.setAttribute('aOpacity', new THREE.InstancedBufferAttribute(opacities, 1))
  geometry.setAttribute('aUvRect', new THREE.InstancedBufferAttribute(uvRects, 4))
  geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3))
  return geometry
}

function DistantGalaxyField() {
  const geometry = useMemo(() => createGalaxyInstances(560, 0x41d33), [])
  const atlas = useMemo(() => createGalaxyAtlas(0x78a1), [])
  const viewDirection = useRef(new THREE.Vector3())
  const cameraPosition = useRef(new THREE.Vector3())
  const field = useRef<THREE.Mesh>(null)
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uGalaxyAtlas: { value: atlas },
      uCameraPosition: { value: new THREE.Vector3(0, 4, 18) },
      uCameraForward: { value: new THREE.Vector3(0, -4, -18).normalize() },
    },
    vertexShader: `
      attribute vec3 aCenter;
      attribute float aDiameter;
      attribute float aOpacity;
      attribute vec4 aUvRect;
      attribute vec3 aTint;
      uniform vec3 uCameraPosition;
      uniform vec3 uCameraForward;
      varying vec2 vGalaxyUv;
      varying vec3 vTint;
      varying float vOpacity;
      void main() {
        vec4 centerView = modelViewMatrix * vec4(aCenter, 1.0);
        vec4 viewPosition = centerView;
        viewPosition.xy += position.xy * aDiameter;
        gl_Position = projectionMatrix * viewPosition;
        vGalaxyUv = aUvRect.xy + uv * aUvRect.zw;
        vTint = aTint;
        vec3 toGalaxy = normalize(aCenter - uCameraPosition);
        float centerClear = 1.0 - smoothstep(0.96, 0.995, dot(toGalaxy, normalize(uCameraForward)));
        vOpacity = aOpacity * centerClear;
      }
    `,
    fragmentShader: `
      uniform sampler2D uGalaxyAtlas;
      varying vec2 vGalaxyUv;
      varying vec3 vTint;
      varying float vOpacity;
      void main() {
        vec4 galaxy = texture2D(uGalaxyAtlas, vGalaxyUv);
        float alpha = galaxy.a * vOpacity;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(galaxy.rgb * vTint, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
    blending: THREE.NormalBlending,
  }), [atlas])
  useEffect(() => () => { geometry.dispose(); atlas.dispose(); material.dispose() }, [geometry, atlas, material])
  useFrame(({ camera }) => {
    const galaxyMesh = field.current
    if (!galaxyMesh || !(galaxyMesh.material instanceof THREE.ShaderMaterial)) return
    camera.getWorldDirection(viewDirection.current)
    camera.getWorldPosition(cameraPosition.current)
    galaxyMesh.material.uniforms.uCameraPosition.value.copy(cameraPosition.current)
    galaxyMesh.material.uniforms.uCameraForward.value.copy(viewDirection.current)
  })
  return <mesh ref={field} geometry={geometry} material={material} frustumCulled={false} renderOrder={-3} raycast={() => null} />
}

type GalaxyForm = 'spiral' | 'edge-on' | 'elliptical' | 'irregular'

interface DeepFieldGalaxy {
  direction: [number, number, number]
  size: [number, number]
  form: GalaxyForm
  seed: number
  rotation: number
  tint: [number, number, number]
}

const deepFieldGalaxies: DeepFieldGalaxy[] = [
  { direction: [0.24, -0.05, -0.96], size: [6, 4], form: 'spiral', seed: 17, rotation: 0.42, tint: [242, 220, 184] },
  { direction: [-0.24, -0.05, -0.96], size: [5, 1.4], form: 'edge-on', seed: 41, rotation: -0.2, tint: [205, 192, 166] },
  { direction: [0.28, -0.32, -0.91], size: [4.5, 4], form: 'elliptical', seed: 83, rotation: 0.88, tint: [222, 215, 198] },
  { direction: [-0.2, -0.3, -0.91], size: [4, 3.2], form: 'irregular', seed: 109, rotation: -0.62, tint: [194, 151, 137] },
  { direction: [0.08, 0.12, -0.98], size: [5, 3.5], form: 'spiral', seed: 137, rotation: -0.92, tint: [188, 207, 216] },
]

function latticeNoise(x: number, y: number, seed: number) {
  let value = Math.imul(x + seed, 374761393) + Math.imul(y - seed, 668265263)
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295
}

function smoothNoise(x: number, y: number, seed: number) {
  const x0 = Math.floor(x); const y0 = Math.floor(y)
  const fx = x - x0; const fy = y - y0
  const sx = fx * fx * (3 - 2 * fx); const sy = fy * fy * (3 - 2 * fy)
  const top = THREE.MathUtils.lerp(latticeNoise(x0, y0, seed), latticeNoise(x0 + 1, y0, seed), sx)
  const bottom = THREE.MathUtils.lerp(latticeNoise(x0, y0 + 1, seed), latticeNoise(x0 + 1, y0 + 1, seed), sx)
  return THREE.MathUtils.lerp(top, bottom, sy)
}

function createGalaxyTexture(galaxy: DeepFieldGalaxy) {
  const canvas = document.createElement('canvas')
  canvas.width = 128; canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) return new THREE.CanvasTexture(canvas)
  const pixels = context.createImageData(canvas.width, canvas.height)
  const aspect = galaxy.form === 'edge-on' ? 0.18 : galaxy.form === 'spiral' ? 0.66 : galaxy.form === 'elliptical' ? 0.78 : 0.86
  const cosine = Math.cos(galaxy.rotation); const sine = Math.sin(galaxy.rotation)
  for (let py = 0; py < canvas.height; py += 1) {
    for (let px = 0; px < canvas.width; px += 1) {
      const x = (px / 127 - 0.5) * 2
      const y = (py / 127 - 0.5) * 2
      const rotatedX = x * cosine - y * sine
      const rotatedY = x * sine + y * cosine
      const broadNoise = smoothNoise(rotatedX * 3.2, rotatedY * 3.2, galaxy.seed)
      const warp = (broadNoise - 0.5) * 0.11
      const localX = rotatedX + warp
      const localY = rotatedY - warp * 0.65
      const radius = Math.sqrt(localX * localX + (localY / aspect) ** 2)
      if (radius > 1.15) continue

      const angle = Math.atan2(localY / aspect, localX)
      let structure = 1
      if (galaxy.form === 'spiral') {
        const arms = Math.cos(angle * 2.6 - Math.log(radius + 0.045) * 3.7 + galaxy.seed * 0.37)
        structure = 0.3 + Math.pow(Math.max(0, arms), 3.2) * 0.7
      } else if (galaxy.form === 'irregular') {
        structure = 0.5 + smoothNoise(localX * 8, localY * 8, galaxy.seed + 9) * 0.5
      }
      const edgeFade = 1 - THREE.MathUtils.smoothstep(radius, 0.72, 1.15)
      const core = Math.exp(-radius * (galaxy.form === 'elliptical' ? 4.1 : 5.2))
      let density = galaxy.form === 'elliptical'
        ? Math.exp(-radius * radius * 4.8) * (0.7 + broadNoise * 0.3)
        : Math.exp(-radius * (galaxy.form === 'edge-on' ? 3.2 : 2.7)) * structure
      if (galaxy.form === 'edge-on') {
        const dustLane = Math.exp(-Math.abs(localY) * 34) * (1 - Math.exp(-Math.abs(localX) * 8))
        density *= 1 - dustLane * 0.34
      }
      density *= edgeFade * (0.76 + smoothNoise(localX * 13, localY * 13, galaxy.seed + 23) * 0.24)
      const warmCore = THREE.MathUtils.smoothstep(core, 0.08, 0.72)
      const tint = galaxy.tint
      const outerColor = [tint[0] * 0.63, tint[1] * 0.72, tint[2] * 0.8]
      const coreColor = [Math.min(255, tint[0] * 1.08), Math.min(255, tint[1] * 1.07), Math.min(255, tint[2] * 1.03)]
      const noiseTint = smoothNoise(localX * 5 + 12, localY * 5 - 7, galaxy.seed + 51)
      const index = (py * canvas.width + px) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        const color = THREE.MathUtils.lerp(outerColor[channel], coreColor[channel], warmCore)
        const dustTint = channel === 0 ? 1 + noiseTint * 0.06 : channel === 2 ? 1 - noiseTint * 0.08 : 1
        pixels.data[index + channel] = Math.round(color * dustTint)
      }
      pixels.data[index + 3] = Math.round(Math.min(0.8, density * (0.46 + warmCore * 0.5)) * 255)
    }
  }
  context.putImageData(pixels, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  return texture
}

function DeepField() {
  const textures = useMemo(() => deepFieldGalaxies.map(createGalaxyTexture), [])
  const positions = useMemo(() => deepFieldGalaxies.map((galaxy) => new THREE.Vector3(...galaxy.direction).normalize().multiplyScalar(84)), [])
  useEffect(() => () => textures.forEach((texture) => texture.dispose()), [textures])
  return <group>
    {deepFieldGalaxies.map((galaxy, index) => {
      return <sprite
        key={galaxy.seed}
        position={positions[index]}
        rotation={[0, 0, galaxy.rotation]}
        scale={[galaxy.size[0], galaxy.size[1], 1]}
        renderOrder={-1}
        raycast={() => null}
      >
        <spriteMaterial map={textures[index]} color="#ffffff" transparent opacity={0.55} depthWrite={false} fog={false} toneMapped={false} />
      </sprite>
    })}
  </group>
}

function CosmicDust() {
  const reducedMotion = useRef(false)
  const viewDirection = useRef(new THREE.Vector3())
  const shaderMaterial = useRef<THREE.ShaderMaterial>(null)
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uViewDirection: { value: new THREE.Vector3(0, -0.2, -0.98).normalize() },
    },
    vertexShader: `varying vec3 vDirection; void main() { vDirection = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vDirection;
      uniform float uTime;
      uniform vec3 uViewDirection;
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
      float noise(vec3 v) {
        const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
        vec3 i = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - 0.5;
        i = mod289(i);
        vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857; vec3 ns = n_ * vec3(2.0, 0.5, 1.0) - vec3(0.0, 1.0, 0.0);
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0) * 2.0 + 1.0; vec4 s1 = floor(b1) * 2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0); m *= m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
      }
      float fbm(vec3 p) { float sum = 0.0; float amplitude = 0.5; for (int i = 0; i < 4; i++) { sum += amplitude * noise(p); p *= 2.03; amplitude *= 0.5; } return sum; }
      void main() {
        vec3 p = vDirection * 6.0 + vec3(uTime * 0.17, -uTime * 0.11, uTime * 0.08);
        float warp = fbm(p * 0.52 + vec3(8.2, 3.1, 5.7));
        float broadCloud = smoothstep(0.24, 0.62, fbm(p * 0.38 + vec3(5.4, 2.1, 9.3)));
        float cloud = smoothstep(0.22, 0.59, fbm(p * 0.86 + vec3(warp * 1.4, -warp * 0.7, warp)));
        float filaments = smoothstep(0.34, 0.75, fbm(p * 2.1 + vec3(2.0, 7.0, 1.0)));
        float region = smoothstep(-0.28, 0.2, fbm(vDirection * 2.2 + vec3(4.0, 9.0, 2.0)));
        float viewAngle = 1.0 - dot(normalize(vDirection), normalize(uViewDirection));
        float clearCenter = smoothstep(0.1, 0.42, viewAngle);
        float cloudMass = cloud * (0.42 + broadCloud * 0.9);
        float opacity = cloudMass * region * clearCenter * (0.022 + filaments * 0.066);
        float warmDust = smoothstep(-0.05, 0.35, warp);
        float coolDust = smoothstep(0.28, 0.55, noise(p * 0.63 + vec3(12.0)));
        vec3 color = mix(vec3(0.024, 0.036, 0.05), vec3(0.094, 0.076, 0.052), warmDust);
        color = mix(color, vec3(0.052, 0.064, 0.076), coolDust * 0.62);
        color = mix(color, vec3(0.084, 0.044, 0.032), coolDust * warmDust * 0.34);
        gl_FragColor = vec4(color, opacity);
      }
    `,
  }), [])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotion.current = preference.matches }
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  useFrame(({ camera, clock }) => {
    const dustMaterial = shaderMaterial.current
    if (!dustMaterial) return
    camera.getWorldDirection(viewDirection.current)
    dustMaterial.uniforms.uViewDirection.value.copy(viewDirection.current)
    dustMaterial.uniforms.uTime.value = reducedMotion.current ? 0 : clock.elapsedTime * 0.035
  })
  return <mesh renderOrder={-2} raycast={() => null}>
    <sphereGeometry args={[96, 56, 40]} />
    <primitive ref={shaderMaterial} object={material} attach="material" />
  </mesh>
}

function PathPulse({ ids, positions, pulseKey }: { ids: string[]; positions: Map<string, [number, number, number]>; pulseKey: number }) {
  const marker = useRef<THREE.Mesh>(null)
  const started = useRef<number | null>(null)
  const reducedMotion = useRef(false)
  const target = useRef(new THREE.Vector3())
  useEffect(() => { started.current = null }, [pulseKey])
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotion.current = preference.matches }
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  useFrame((state) => {
    if (!marker.current || ids.length === 0) return
    if (reducedMotion.current) {
      const point = positions.get(ids[0])
      if (point) marker.current.position.set(...point)
      return
    }
    if (started.current === null) started.current = state.clock.elapsedTime
    const elapsed = state.clock.elapsedTime - started.current
    if (ids.length === 1) {
      const point = positions.get(ids[0])
      if (point) marker.current.position.set(...point)
      return
    }
    const span = ids.length - 1
    const phase = (elapsed * 0.28) % 1 * span
    const segment = Math.min(Math.floor(phase), span - 1)
    const from = positions.get(ids[segment]); const to = positions.get(ids[segment + 1])
    if (!from || !to) return
    marker.current.position.set(...from).lerp(target.current.set(...to), phase - segment)
  })
  return <mesh ref={marker} raycast={() => null}>
    <sphereGeometry args={[0.105, 12, 12]} />
    <meshBasicMaterial color="#f2d9ff" transparent opacity={0.88} />
  </mesh>
}

interface PlasmaStrand {
  curve: THREE.CatmullRomCurve3
  samples: Float32Array
  points: THREE.Vector3[]
}

function createPlasmaStrand(from: THREE.Vector3, to: THREE.Vector3, seed: number, strandIndex: number): PlasmaStrand {
  const axis = to.clone().sub(from).normalize()
  const reference = Math.abs(axis.y) < 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const normalA = new THREE.Vector3().crossVectors(axis, reference).normalize()
  const normalB = new THREE.Vector3().crossVectors(axis, normalA).normalize()
  const random = createRandom(seed ^ Math.imul(strandIndex + 1, 0x45d9f3b))
  const frequency = 1.2 + random() * 1.7 + strandIndex * 0.28
  const phaseA = random() * Math.PI * 2
  const phaseB = random() * Math.PI * 2
  const amplitude = strandIndex === 0 ? 0.026 : 0.052 + random() * 0.035
  const controlPoints = Array.from({ length: 11 }, (_, index) => {
    const t = index / 10
    const envelope = Math.pow(Math.sin(Math.PI * t), 0.8)
    const waveA = Math.sin(t * Math.PI * 2 * frequency + phaseA) * amplitude
      + Math.sin(t * Math.PI * 2 * (frequency * 1.83) + phaseB) * amplitude * 0.24
    const waveB = Math.sin(t * Math.PI * 2 * (frequency * 0.71) + phaseB) * amplitude * 0.66
    return from.clone().lerp(to, t)
      .addScaledVector(normalA, waveA * envelope)
      .addScaledVector(normalB, waveB * envelope)
  })
  const curve = new THREE.CatmullRomCurve3(controlPoints, false, 'centripetal', 0.38)
  const sampledPoints = curve.getSpacedPoints(128)
  const samples = new Float32Array(sampledPoints.length * 3)
  sampledPoints.forEach((point, index) => samples.set([point.x, point.y, point.z], index * 3))
  return { curve, samples, points: sampledPoints }
}

interface VisibleEdge {
  edge: GraphRelationship
  source: [number, number, number]
  target: [number, number, number]
  pathEdge: boolean
  activeBeam: boolean
  focusEdge: boolean
  joinsGroup: boolean
}

const plasmaLayers = [
  { color: '#bd8742', radius: 0.052, opacity: 0.075 },
  { color: '#d7b16b', radius: 0.018, opacity: 0.38 },
  { color: '#f3e4c7', radius: 0.0065, opacity: 0.7 },
] as const

const companionFilaments = [
  { color: '#d6b577', radius: 0.0045, opacity: 0.2 },
  { color: '#c6d6dc', radius: 0.0035, opacity: 0.14 },
] as const

interface TubeBuffers { positions: number[]; indices: number[] }

function appendPlasmaTube(target: TubeBuffers & { edgeIndices: number[] }, curve: THREE.CatmullRomCurve3, radius: number, edgeIndex: number) {
  const tube = new THREE.TubeGeometry(curve, 96, radius, 8, false)
  const positions = tube.getAttribute('position').array
  const indices = tube.getIndex()?.array
  const vertexOffset = target.positions.length / 3
  for (let index = 0; index < positions.length; index += 1) target.positions.push(positions[index])
  for (let index = 0; index < positions.length / 3; index += 1) target.edgeIndices.push(edgeIndex)
  if (indices) for (let index = 0; index < indices.length; index += 1) target.indices.push(indices[index] + vertexOffset)
  tube.dispose()
}

function PlasmaNetwork({ connections, emphasisByEdge }: {
  connections: VisibleEdge[]
  emphasisByEdge: Map<string, { selected: number; bfs: number }>
}) {
  const edgeStates = useRef(new Map<string, { selected: number; bfs: number }>())
  const edgeStateTextureRef = useRef<THREE.DataTexture | null>(null)
  const geometryData = useMemo(() => {
    const layerCount = plasmaLayers.length + companionFilaments.length
    const buffers = Array.from({ length: layerCount }, () => ({ positions: [] as number[], indices: [] as number[], edgeIndices: [] as number[] }))
    const edgeIndices = new Map<string, number>()
    connections.forEach((connection, edgeIndex) => {
      edgeIndices.set(connection.edge.id, edgeIndex)
      const from = new THREE.Vector3(...connection.source)
      const to = new THREE.Vector3(...connection.target)
      const seed = hashText(connection.edge.id)
      const mainStrand = createPlasmaStrand(from, to, seed, 0)
      plasmaLayers.forEach((layer, index) => appendPlasmaTube(buffers[index], mainStrand.curve, layer.radius, edgeIndex))
      companionFilaments.forEach((layer, index) => {
        const strand = createPlasmaStrand(from, to, seed, index + 1)
        appendPlasmaTube(buffers[plasmaLayers.length + index], strand.curve, layer.radius, edgeIndex)
      })
    })
    const geometries = buffers.map((buffer) => {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffer.positions, 3))
      geometry.setAttribute('aEdgeIndex', new THREE.Float32BufferAttribute(buffer.edgeIndices, 1))
      if (buffer.indices.length) geometry.setIndex(buffer.indices)
      return geometry
    })
    return { geometries, edgeIndices }
  }, [connections])
  const edgeCount = Math.max(1, geometryData.edgeIndices.size)
  const edgeStateTexture = useMemo(() => {
    const texture = new THREE.DataTexture(new Uint8Array(edgeCount * 4), edgeCount, 1, THREE.RGBAFormat, THREE.UnsignedByteType)
    texture.minFilter = THREE.NearestFilter
    texture.magFilter = THREE.NearestFilter
    texture.generateMipmaps = false
    texture.needsUpdate = true
    return texture
  }, [edgeCount])
  useEffect(() => {
    const liveIds = new Set(connections.map((connection) => connection.edge.id))
    edgeStates.current.forEach((_, id) => { if (!liveIds.has(id)) edgeStates.current.delete(id) })
    connections.forEach((connection) => {
      if (!edgeStates.current.has(connection.edge.id)) edgeStates.current.set(connection.edge.id, { selected: 0, bfs: 0 })
    })
  }, [connections])
  const materials = useMemo(() => {
    const definitions = [
      ...plasmaLayers.map((layer) => ({ ...layer, focusColor: layer.color === '#bd8742' ? '#e1aa5c' : layer.color === '#d7b16b' ? '#f2d18a' : '#fff7e5', pathColor: layer.color === '#bd8742' ? '#a8cbd5' : layer.color === '#d7b16b' ? '#e4d6b4' : '#efffff' })),
      ...companionFilaments.map((layer) => ({ ...layer, focusColor: layer.color === '#d6b577' ? '#e7c786' : '#dce8e9', pathColor: layer.color === '#d6b577' ? '#d9c28f' : '#c4d7db' })),
    ]
    return definitions.map((definition) => new THREE.ShaderMaterial({
      uniforms: {
        uEdgeState: { value: edgeStateTexture },
        uEdgeCount: { value: edgeCount },
        uBaseColor: { value: new THREE.Color(definition.color) },
        uSelectedColor: { value: new THREE.Color(definition.focusColor) },
        uBfsColor: { value: new THREE.Color(definition.pathColor) },
        uOpacity: { value: definition.opacity },
      },
      vertexShader: `
        attribute float aEdgeIndex;
        varying float vEdgeIndex;
        void main() {
          vEdgeIndex = aEdgeIndex;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uEdgeState;
        uniform float uEdgeCount;
        uniform vec3 uBaseColor;
        uniform vec3 uSelectedColor;
        uniform vec3 uBfsColor;
        uniform float uOpacity;
        varying float vEdgeIndex;
        void main() {
          vec4 state = texture2D(uEdgeState, vec2((vEdgeIndex + 0.5) / uEdgeCount, 0.5));
          float selected = smoothstep(0.025, 0.86, state.r);
          float bfs = smoothstep(0.025, 0.86, state.g);
          selected *= 1.0 - bfs;
          vec3 color = mix(uBaseColor, uSelectedColor, selected);
          color = mix(color, uBfsColor, bfs);
          float visibility = 0.18 + selected * 0.76 + bfs * 0.92;
          float energy = 0.58 + selected * 1.12 + bfs * 1.42;
          gl_FragColor = vec4(color * energy, uOpacity * visibility);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }))
  }, [edgeCount, edgeStateTexture])

  useEffect(() => () => {
    geometryData.geometries.forEach((geometry) => geometry.dispose())
    materials.forEach((material) => material.dispose())
    edgeStateTexture.dispose()
  }, [geometryData, materials, edgeStateTexture])
  useEffect(() => { edgeStateTextureRef.current = edgeStateTexture }, [edgeStateTexture])

  useFrame((_, delta) => {
    const texture = edgeStateTextureRef.current
    if (!texture) return
    const stateData = texture.image.data as Uint8Array
    for (const connection of connections) {
      const edgeIndex = geometryData.edgeIndices.get(connection.edge.id)
      const edgeState = edgeStates.current.get(connection.edge.id)
      if (edgeIndex === undefined || !edgeState) continue
      const emphasis = emphasisByEdge.get(connection.edge.id)
      const targetSelected = emphasis?.selected ?? 0
      const targetBfs = emphasis?.bfs ?? 0
      edgeState.selected = THREE.MathUtils.damp(edgeState.selected, targetSelected, 5.5, delta)
      edgeState.bfs = THREE.MathUtils.damp(edgeState.bfs, targetBfs, 6.5, delta)
      const offset = edgeIndex * 4
      stateData[offset] = Math.round(edgeState.selected * 255)
      stateData[offset + 1] = Math.round(edgeState.bfs * 255)
    }
    texture.needsUpdate = true
  })

  return <group raycast={() => null}>
    {geometryData.geometries.map((geometry, layer) => <mesh key={layer} geometry={geometry} material={materials[layer]} raycast={() => null} />)}
  </group>
}

function samplePath(samples: Float32Array, progress: number, target: THREE.Vector3) {
  const count = samples.length / 3
  const scaled = THREE.MathUtils.clamp(progress, 0, 1) * (count - 1)
  const index = Math.min(Math.floor(scaled), count - 2)
  const blend = scaled - index
  const offset = index * 3
  target.set(
    THREE.MathUtils.lerp(samples[offset], samples[offset + 3], blend),
    THREE.MathUtils.lerp(samples[offset + 1], samples[offset + 4], blend),
    THREE.MathUtils.lerp(samples[offset + 2], samples[offset + 5], blend),
  )
}

function EnergyFlows({ connections, emphasisByEdge, arrivals }: {
  connections: VisibleEdge[]
  emphasisByEdge: Map<string, { selected: number; bfs: number }>
  arrivals: Map<string, number>
}) {
  const coreMesh = useRef<THREE.InstancedMesh>(null)
  const glowMesh = useRef<THREE.InstancedMesh>(null)
  const transform = useRef(new THREE.Object3D())
  const lastCycles = useRef<number[]>([])
  const reducedMotion = useRef(false)
  const selectedValues = useRef(new Float32Array(0))
  const bfsValues = useRef(new Float32Array(0))
  const flows = useMemo(() => connections.flatMap((connection) => {
    const seed = hashText(connection.edge.id)
    const from = new THREE.Vector3(...connection.source)
    const to = new THREE.Vector3(...connection.target)
    const strand = createPlasmaStrand(from, to, seed, 1)
    return [false, true].map((reverse) => ({
      edgeId: connection.edge.id,
      samples: strand.samples,
      sourceId: reverse ? connection.edge.targetNoteId : connection.edge.sourceNoteId,
      targetId: reverse ? connection.edge.sourceNoteId : connection.edge.targetNoteId,
      phase: ((seed + (reverse ? 487 : 0)) % 997) / 997,
      speed: 0.16 + (((seed >>> (reverse ? 12 : 10)) % 1000) / 9000),
      reverse,
      points: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    }))
  }), [connections])
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 8, 8), [])
  const coreMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), [])
  const glowMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), [])
  useEffect(() => () => { geometry.dispose(); coreMaterial.dispose(); glowMaterial.dispose() }, [geometry, coreMaterial, glowMaterial])
  useEffect(() => { lastCycles.current = Array.from({ length: flows.length }, () => -1) }, [flows])
  useEffect(() => {
    selectedValues.current = new Float32Array(flows.length)
    bfsValues.current = new Float32Array(flows.length)
  }, [flows])
  useEffect(() => {
    const core = coreMesh.current
    const glow = glowMesh.current
    if (!core || !glow) return
    for (let flowIndex = 0; flowIndex < flows.length; flowIndex += 1) {
      for (let particleIndex = 0; particleIndex < 3; particleIndex += 1) glow.setColorAt(flowIndex * 3 + particleIndex, idleGlowColor)
      core.setColorAt(flowIndex, idlePulseCoreColor)
    }
    if (core.instanceColor) core.instanceColor.needsUpdate = true
    if (glow.instanceColor) glow.instanceColor.needsUpdate = true
  }, [flows])

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotion.current = preference.matches }
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  useFrame((state, delta) => {
    const elapsed = reducedMotion.current ? 0 : state.clock.elapsedTime
    const core = coreMesh.current
    const glow = glowMesh.current
    if (!core || !glow) return
    for (let flowIndex = 0; flowIndex < flows.length; flowIndex += 1) {
      const flow = flows[flowIndex]
      const emphasis = emphasisByEdge.get(flow.edgeId)
      selectedValues.current[flowIndex] = THREE.MathUtils.damp(selectedValues.current[flowIndex], emphasis?.selected ?? 0, 5.5, delta)
      bfsValues.current[flowIndex] = THREE.MathUtils.damp(bfsValues.current[flowIndex], emphasis?.bfs ?? 0, 6.5, delta)
      const selected = selectedValues.current[flowIndex]
      const bfs = bfsValues.current[flowIndex]
      const glowEmphasis = selected * 0.78 + bfs
      pulseColorScratch.copy(idleGlowColor).lerp(activeGlowColor, selected).lerp(pathGlowColor, bfs)
      for (let particleIndex = 0; particleIndex < 3; particleIndex += 1) glow.setColorAt(flowIndex * 3 + particleIndex, pulseColorScratch)
      pulseColorScratch.copy(idlePulseCoreColor).lerp(activePulseCoreColor, selected).lerp(pathPulseCoreColor, bfs)
      core.setColorAt(flowIndex, pulseColorScratch)
      const cycle = (elapsed * flow.speed + flow.phase) % 1
      if (!reducedMotion.current && lastCycles.current[flowIndex] < 0.92 && cycle >= 0.92) arrivals.set(flow.targetId, Math.min(elapsed + 0.34, Math.max(arrivals.get(flow.targetId) ?? 0, elapsed + 0.28)))
      lastCycles.current[flowIndex] = cycle
      const travel = Math.min(1, cycle / 0.92)
      const progress = flow.reverse ? 1 - travel : travel
      for (let particleIndex = 0; particleIndex < 3; particleIndex += 1) {
        const particleProgress = progress + (flow.reverse ? 1 : -1) * flowTrailOffsets[particleIndex]
        samplePath(flow.samples, THREE.MathUtils.clamp(particleProgress, 0, 1), flow.points[particleIndex])
        const inRange = particleProgress >= 0 && particleProgress <= 1
        transform.current.position.copy(flow.points[particleIndex])
        const glowScale = particleIndex === 0 ? 0.042 : particleIndex === 1 ? 0.029 : 0.018
        transform.current.scale.setScalar(glowScale * (0.66 + glowEmphasis * 0.5))
        if (particleIndex > 0 && !inRange) transform.current.scale.setScalar(0)
        transform.current.updateMatrix()
        glow.setMatrixAt(flowIndex * 3 + particleIndex, transform.current.matrix)
      }
      const headProgress = progress
      samplePath(flow.samples, headProgress, flow.points[0])
      transform.current.position.copy(flow.points[0])
      transform.current.scale.setScalar(0.018 * (0.66 + glowEmphasis * 0.62))
      transform.current.updateMatrix()
      core.setMatrixAt(flowIndex, transform.current.matrix)
    }
    core.instanceMatrix.needsUpdate = true
    glow.instanceMatrix.needsUpdate = true
    if (core.instanceColor) core.instanceColor.needsUpdate = true
    if (glow.instanceColor) glow.instanceColor.needsUpdate = true
  })

  return <group raycast={() => null}>
    <instancedMesh ref={glowMesh} args={[geometry, glowMaterial, flows.length * 3]} frustumCulled={false} raycast={() => null} />
    <instancedMesh ref={coreMesh} args={[geometry, coreMaterial, flows.length]} frustumCulled={false} raycast={() => null} />
  </group>
}

function Scene({ notes, edges, selectedId, hoveredId, highlightIds, pathIds, pathPulseKey, visualEvent, onVisualEventComplete, onSelect, onHover }: GalaxyCanvasProps) {
  const positions = useMemo(() => createGalaxyLayout(notes), [notes])
  const arrivalUntil = useMemo(() => new Map<string, number>(), [])
  const revealTimeline = useRef<NodeRevealTimeline>({ startedAt: 0 })
  const revealOrder = useMemo(() => new Map([...notes].sort((first, second) => first.id.localeCompare(second.id)).map((note, index) => [note.id, index])), [notes])
  useEffect(() => {
    revealTimeline.current.startedAt = performance.now() + NODE_REVEAL_DELAY_MS
  }, [notes])
  const neighbors = useMemo(() => createNeighborMap(notes, edges), [notes, edges])
  const nodeHaloTexture = useMemo(() => createNodeHaloTexture(), [])
  useEffect(() => () => nodeHaloTexture.dispose(), [nodeHaloTexture])
  const focus = selectedId ? positions.get(selectedId) ?? null : null
  const focusId = selectedId ?? hoveredId
  const pathSet = useMemo(() => pathIds ? new Set(pathIds) : null, [pathIds])
  const filterSet = useMemo(() => pathSet ?? (highlightIds ? new Set(highlightIds) : null), [pathSet, highlightIds])
  const emphasized = useMemo(() => {
    if (!focusId) return null
    return new Set([focusId, ...(neighbors.get(focusId) ?? [])])
  }, [focusId, neighbors])
  const pathEdgeKeys = useMemo(() => {
    if (!pathIds || pathIds.length < 2) return new Set<string>()
    return new Set(pathIds.slice(0, -1).map((id, index) => [id, pathIds[index + 1]].sort().join('\u0000')))
  }, [pathIds])
  const visibleEdges = useMemo(() => edges.flatMap((edge) => {
    const source = positions.get(edge.sourceNoteId)
    const target = positions.get(edge.targetNoteId)
    if (!source || !target) return []
    const pathEdge = Boolean(pathSet && pathEdgeKeys.has([edge.sourceNoteId, edge.targetNoteId].sort().join('\u0000')))
    const joinsGroup = Boolean(!pathSet && highlightIds?.includes(edge.sourceNoteId) && highlightIds.includes(edge.targetNoteId))
    const focusEdge = Boolean(focusId && (edge.sourceNoteId === focusId || edge.targetNoteId === focusId))
    const activeBeam = Boolean(selectedId && !pathEdge && (edge.sourceNoteId === selectedId || edge.targetNoteId === selectedId))
    return [{ edge, source, target, pathEdge, activeBeam, focusEdge, joinsGroup }]
  }), [edges, positions, pathSet, pathEdgeKeys, highlightIds, focusId, selectedId])
  const beamConnections = useMemo(() => edges.flatMap((edge) => {
    const source = positions.get(edge.sourceNoteId)
    const target = positions.get(edge.targetNoteId)
    return source && target ? [{ edge, source, target, pathEdge: false, activeBeam: false, focusEdge: false, joinsGroup: false }] : []
  }), [edges, positions])
  const hasActiveBfsPath = pathEdgeKeys.size > 0
  const beamEmphasis = useMemo(() => new Map(visibleEdges.map((connection) => [connection.edge.id, {
    selected: !hasActiveBfsPath && connection.activeBeam ? 1 : 0,
    bfs: connection.pathEdge ? 1 : 0,
  }])), [visibleEdges, hasActiveBfsPath])
  const pathPoints = pathIds?.map((id) => positions.get(id)).filter((point): point is [number, number, number] => Boolean(point)) ?? []
  const mutationPosition = visualEvent?.kind === 'delete'
    ? visualEvent.position
    : visualEvent?.kind === 'create' ? positions.get(visualEvent.noteId ?? '')
      : visualEvent ? positions.get(visualEvent.sourceId ?? '') : undefined
  const mutationTarget = visualEvent?.kind === 'relationship' ? positions.get(visualEvent.targetId ?? '') : undefined
  const mutationEdgeExists = visualEvent?.kind !== 'relationship' || edges.some((edge) =>
    (edge.sourceNoteId === visualEvent.sourceId && edge.targetNoteId === visualEvent.targetId) ||
    (edge.sourceNoteId === visualEvent.targetId && edge.targetNoteId === visualEvent.sourceId))
  return <>
    <color attach="background" args={['#030507']} />
    <fog attach="fog" args={['#030507', 36, 78]} />
    <ambientLight intensity={0.58} color="#b7b2a7" />
    <directionalLight position={[7, 10, 8]} intensity={0.48} color="#dfc69b" />
    <CosmicDust />
    <StarField />
    <DeepField />
    <DistantGalaxyField />
    <group>
      <PlasmaNetwork connections={beamConnections} emphasisByEdge={beamEmphasis} />
      <EnergyFlows connections={beamConnections} emphasisByEdge={beamEmphasis} arrivals={arrivalUntil} />
      {pathPoints.length > 0 && <PathPulse key={pathPulseKey} ids={pathIds ?? []} positions={positions} pulseKey={pathPulseKey} />}
    </group>
    {notes.map((note) => {
      const position = positions.get(note.id)
      if (!position) return null
      const focused = filterSet ?? emphasized
      const active = Boolean(focused?.has(note.id))
      const prominent = note.importance >= 92 || (neighbors.get(note.id)?.size ?? 0) >= 5
      return <NoteNode key={note.id} note={note} position={position} active={active} dimmed={Boolean(focused && !active)} hovered={note.id === hoveredId} selected={note.id === selectedId} prominent={prominent} onPath={Boolean(pathSet?.has(note.id))} haloTexture={nodeHaloTexture} arrivalUntil={arrivalUntil} revealTimeline={revealTimeline} revealIndex={revealOrder.get(note.id) ?? 0} onSelect={() => onSelect(note)} onHover={onHover} />
    })}
    {visualEvent && mutationPosition && mutationEdgeExists && (visualEvent.kind !== 'relationship' || mutationTarget) && <GraphMutationEffect
      key={visualEvent.key} event={visualEvent} position={mutationPosition} target={mutationTarget}
      onComplete={onVisualEventComplete} />}
    <CameraFocus focus={focus as [number, number, number] | null} />
  </>
}

export function GalaxyCanvas(props: GalaxyCanvasProps) {
  return <Canvas camera={{ position: [0, 4, 18], fov: 48 }} dpr={[1, 1.6]} gl={{ antialias: true, alpha: false }} onPointerMissed={() => props.onHover(null)}>
    <Scene {...props} />
  </Canvas>
}
