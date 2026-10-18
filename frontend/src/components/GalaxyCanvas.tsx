import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
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

function NoteNode({ note, position, active, dimmed, selected, onSelect, onHover }: {
  note: GraphNote; position: [number, number, number]; active: boolean; dimmed: boolean
  selected: boolean; onSelect: () => void; onHover: (id: string | null) => void
}) {
  const group = useRef<THREE.Group>(null)
  const color = nodeColor(note.type)
  const radius = nodeRadius(note.importance)
  useFrame((_, delta) => {
    if (!group.current) return
    const target = selected ? 1.2 : active ? 1.12 : 1
    group.current.scale.setScalar(THREE.MathUtils.damp(group.current.scale.x, target, 8, delta))
  })
  return (
    <group ref={group} position={position}>
      <mesh
        onClick={(event) => { event.stopPropagation(); onSelect() }}
        onPointerOver={(event) => { event.stopPropagation(); onHover(note.id); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { onHover(null); document.body.style.cursor = 'auto' }}
      >
        <sphereGeometry args={[radius, 20, 20]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 0.9 : active ? 0.48 : 0.16} roughness={0.62} metalness={0.08} transparent opacity={dimmed ? 0.36 : 0.96} />
      </mesh>
      <mesh scale={selected ? 1.7 : 1.4} raycast={() => null}>
        <sphereGeometry args={[radius, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={dimmed ? 0.008 : selected ? 0.055 : 0.018} depthWrite={false} />
      </mesh>
      {(selected || active) && <mesh rotation={[Math.PI / 2.25, 0, 0]} raycast={() => null}>
        <torusGeometry args={[radius * 1.48, 0.008, 5, 48]} />
        <meshBasicMaterial color={color} transparent opacity={dimmed ? 0.08 : selected ? 0.48 : 0.28} />
      </mesh>}
      {selected && <NodeCorona radius={radius} seed={note.id} />}
    </group>
  )
}

function NodeCorona({ radius, seed }: { radius: number; seed: string }) {
  const arcs = useMemo(() => {
    const random = createRandom(hashText(seed))
    return Array.from({ length: 3 }, (_, arcIndex) => {
      const start = random() * Math.PI * 2
      const sweep = Math.PI * (0.72 + random() * 0.3)
      const tilt = random() * Math.PI
      const phase = random() * Math.PI * 2
      const controls = Array.from({ length: 13 }, (_, index) => {
        const progress = index / 12
        const angle = start + sweep * progress
        const irregularRadius = radius * 1.62 * (1 + Math.sin(angle * (2.2 + arcIndex) + phase) * 0.075)
        const x = Math.cos(angle) * irregularRadius
        const planarY = Math.sin(angle) * irregularRadius
        const y = planarY * Math.cos(tilt)
        const z = planarY * Math.sin(tilt) + Math.sin(angle * 3 + phase) * radius * 0.12
        return new THREE.Vector3(x, y, z)
      })
      const curve = new THREE.CatmullRomCurve3(controls)
      return curve
    })
  }, [radius, seed])
  const sparks = useMemo(() => {
    const random = createRandom(hashText(`${seed}:corona`))
    return Array.from({ length: 4 }, () => {
      const angle = random() * Math.PI * 2
      const tilt = random() * Math.PI
      const distance = radius * (1.48 + random() * 0.28)
      const planarY = Math.sin(angle) * distance
      return {
        position: [Math.cos(angle) * distance, planarY * Math.cos(tilt), planarY * Math.sin(tilt)] as [number, number, number],
        size: radius * (0.055 + random() * 0.035),
      }
    })
  }, [radius, seed])
  return <group raycast={() => null}>
    {arcs.map((curve, index) => <mesh key={index} raycast={() => null}>
      <tubeGeometry args={[curve, 40, radius * 0.022, 4, false]} />
      <meshBasicMaterial color={index === 1 ? '#e8c982' : '#f4e5c3'} transparent opacity={index === 1 ? 0.26 : 0.4} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>)}
    {sparks.map((spark, index) => <mesh key={index} position={spark.position} raycast={() => null}>
      <sphereGeometry args={[spark.size, 6, 6]} />
      <meshBasicMaterial color={index % 2 ? '#e9bd72' : '#fff1d2'} transparent opacity={0.68} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>)}
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
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    toneMapped: false,
    uniforms: {},
    vertexShader: `varying vec3 vDirection; void main() { vDirection = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vDirection;
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
        vec3 p = vDirection * 6.0;
        float warp = fbm(p * 0.72 + vec3(8.2, 3.1, 5.7));
        float cloud = smoothstep(0.12, 0.58, fbm(p + vec3(warp * 1.4, -warp * 0.7, warp)));
        float filaments = smoothstep(0.34, 0.75, fbm(p * 2.1 + vec3(2.0, 7.0, 1.0)));
        float region = smoothstep(-0.28, 0.2, fbm(vDirection * 2.2 + vec3(4.0, 9.0, 2.0)));
        float opacity = cloud * region * (0.012 + filaments * 0.045);
        vec3 color = mix(vec3(0.017, 0.032, 0.052), vec3(0.073, 0.064, 0.047), smoothstep(-0.05, 0.35, warp));
        color = mix(color, vec3(0.066, 0.03, 0.027), smoothstep(0.28, 0.55, noise(p * 0.63 + vec3(12.0))));
        gl_FragColor = vec4(color, opacity);
      }
    `,
  }), [])
  useEffect(() => () => material.dispose(), [material])
  return <mesh renderOrder={-2}>
    <sphereGeometry args={[96, 56, 40]} />
    <primitive object={material} attach="material" />
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
  return { curve, samples }
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

function ActiveBeam({ source, target, edgeId, sourceIsSelected }: {
  source: [number, number, number]; target: [number, number, number]; edgeId: string; sourceIsSelected: boolean
}) {
  const primaryPulse = useRef<THREE.Group>(null)
  const sparkOne = useRef<THREE.Mesh>(null)
  const sparkTwo = useRef<THREE.Mesh>(null)
  const primaryGlow = useRef<THREE.MeshBasicMaterial>(null)
  const primaryCore = useRef<THREE.MeshBasicMaterial>(null)
  const sparkOneMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const sparkTwoMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const from = useMemo(() => new THREE.Vector3(...source), [source])
  const to = useMemo(() => new THREE.Vector3(...target), [target])
  const seed = useMemo(() => hashText(edgeId), [edgeId])
  const strands = useMemo(() => [0, 1, 2].map((index) => createPlasmaStrand(from, to, seed, index)), [from, to, seed])
  const timing = useMemo(() => ({
    phase: (seed % 997) / 997,
    speed: 0.2 + ((seed >>> 10) % 1000) / 10000,
  }), [seed])
  const reducedMotion = useRef(false)
  const samplePoint = useRef(new THREE.Vector3())

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotion.current = preference.matches }
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  useFrame((state) => {
    if (!primaryPulse.current || !sparkOne.current || !sparkTwo.current) return
    if (reducedMotion.current) {
      const originProgress = sourceIsSelected ? 0 : 1
      samplePath(strands[0].samples, originProgress, samplePoint.current)
      primaryPulse.current.position.copy(samplePoint.current)
      sparkOne.current.visible = false
      sparkTwo.current.visible = false
      if (primaryGlow.current) primaryGlow.current.opacity = 0.3
      if (primaryCore.current) primaryCore.current.opacity = 0.8
      return
    }
    const elapsed = state.clock.elapsedTime
    const pulseProgress = (elapsed * timing.speed + timing.phase) % 1
    const pathProgress = sourceIsSelected ? pulseProgress : 1 - pulseProgress
    samplePath(strands[0].samples, pathProgress, samplePoint.current)
    primaryPulse.current.position.copy(samplePoint.current)
    const endpointFade = Math.min(1, pulseProgress / 0.055, (1 - pulseProgress) / 0.055)
    if (primaryGlow.current) primaryGlow.current.opacity = 0.5 * endpointFade
    if (primaryCore.current) primaryCore.current.opacity = endpointFade

    const firstSparkProgress = (elapsed * timing.speed * 0.72 + timing.phase + 0.31) % 1
    const secondSparkProgress = (elapsed * timing.speed * 0.54 + timing.phase + 0.63) % 1
    samplePath(strands[1].samples, sourceIsSelected ? firstSparkProgress : 1 - firstSparkProgress, sparkOne.current.position)
    samplePath(strands[2].samples, sourceIsSelected ? secondSparkProgress : 1 - secondSparkProgress, sparkTwo.current.position)
    sparkOne.current.visible = true
    sparkTwo.current.visible = true
    if (sparkOneMaterial.current) sparkOneMaterial.current.opacity = 0.72 * Math.min(1, firstSparkProgress / 0.08, (1 - firstSparkProgress) / 0.08)
    if (sparkTwoMaterial.current) sparkTwoMaterial.current.opacity = 0.68 * Math.min(1, secondSparkProgress / 0.08, (1 - secondSparkProgress) / 0.08)
  })

  const origin = sourceIsSelected ? from : to
  return <group raycast={() => null}>
    <mesh raycast={() => null}>
      <tubeGeometry args={[strands[0].curve, 72, 0.052, 6, false]} />
      <meshBasicMaterial color="#c9873f" transparent opacity={0.075} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
    {strands.map((strand, index) => <mesh key={index} raycast={() => null}>
      <tubeGeometry args={[strand.curve, 72, index === 0 ? 0.014 : 0.007, 5, false]} />
      <meshBasicMaterial
        color={index === 0 ? '#fff0d0' : index === 1 ? '#f0d397' : '#d8e1df'}
        transparent opacity={index === 0 ? 0.94 : index === 1 ? 0.5 : 0.38}
        blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}
      />
    </mesh>)}
    <group ref={primaryPulse} position={origin} raycast={() => null}>
      <mesh raycast={() => null}>
        <sphereGeometry args={[0.12, 10, 10]} />
        <meshBasicMaterial ref={primaryGlow} color="#e4a952" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh raycast={() => null}>
        <sphereGeometry args={[0.052, 10, 10]} />
        <meshBasicMaterial ref={primaryCore} color="#fff9e9" transparent opacity={1} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
    <mesh ref={sparkOne} position={origin} raycast={() => null}>
      <sphereGeometry args={[0.034, 8, 8]} />
      <meshBasicMaterial ref={sparkOneMaterial} color="#ffe5aa" transparent opacity={0.72} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
    <mesh ref={sparkTwo} position={origin} raycast={() => null}>
      <sphereGeometry args={[0.024, 8, 8]} />
      <meshBasicMaterial ref={sparkTwoMaterial} color="#e2eff0" transparent opacity={0.68} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  </group>
}

function Scene({ notes, edges, selectedId, hoveredId, highlightIds, pathIds, pathPulseKey, visualEvent, onVisualEventComplete, onSelect, onHover }: GalaxyCanvasProps) {
  const positions = useMemo(() => createGalaxyLayout(notes), [notes])
  const neighbors = useMemo(() => createNeighborMap(notes, edges), [notes, edges])
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
  const visibleEdges = edges.flatMap((edge) => {
    const source = positions.get(edge.sourceNoteId)
    const target = positions.get(edge.targetNoteId)
    if (!source || !target) return []
    const pathEdge = Boolean(pathSet && pathEdgeKeys.has([edge.sourceNoteId, edge.targetNoteId].sort().join('\u0000')))
    const joinsGroup = Boolean(!pathSet && highlightIds?.includes(edge.sourceNoteId) && highlightIds.includes(edge.targetNoteId))
    const focusEdge = Boolean(focusId && (edge.sourceNoteId === focusId || edge.targetNoteId === focusId))
    const lit = pathEdge || joinsGroup || focusEdge || (!pathSet && !highlightIds && !focusId)
    const activeBeam = Boolean(selectedId && !pathEdge && (edge.sourceNoteId === selectedId || edge.targetNoteId === selectedId))
    return [{ edge, source, target, lit, pathEdge, activeBeam, focusEdge }]
  })
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
    <group>
      {visibleEdges.map(({ edge, source, target, lit, pathEdge, activeBeam, focusEdge }) => <group key={edge.id}>
        <Line points={[source, target]} color={pathEdge ? '#b7d5e5' : lit ? '#aaa79e' : '#777b80'} transparent opacity={pathEdge ? 0.76 : lit ? selectedId && focusEdge ? 0.28 : hoveredId && !selectedId && focusEdge ? 0.2 : 0.28 : 0.12} lineWidth={pathEdge ? 1.75 : lit ? 0.85 : 0.65} depthWrite={false} raycast={() => null} />
        {pathEdge && <>
          <Line points={[source, target]} color="#d3a85e" transparent opacity={0.26} lineWidth={4.2} depthWrite={false} raycast={() => null} />
          <Line points={[source, target]} color="#e5eff0" transparent opacity={0.88} lineWidth={1.15} depthWrite={false} raycast={() => null} />
        </>}
        {activeBeam && <ActiveBeam source={source} target={target} edgeId={edge.id} sourceIsSelected={edge.sourceNoteId === selectedId} />}
      </group>)}
      {pathPoints.length > 0 && <PathPulse key={pathPulseKey} ids={pathIds ?? []} positions={positions} pulseKey={pathPulseKey} />}
    </group>
    {notes.map((note) => {
      const position = positions.get(note.id)
      if (!position) return null
      const focused = filterSet ?? emphasized
      const active = Boolean(focused?.has(note.id))
      return <NoteNode key={note.id} note={note} position={position} active={active} dimmed={Boolean(focused && !active)} selected={note.id === selectedId} onSelect={() => onSelect(note)} onHover={onHover} />
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
