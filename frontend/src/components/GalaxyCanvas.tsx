import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, Environment, Lightformer, OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'
import type { GalaxyCameraSnapshot, GraphNote, GraphRelationship } from '../types'
import { createGalaxyLayout, createNeighborMap, nodeColor, nodeRadius } from '../galaxy/layout'

interface GalaxyCanvasProps {
  notes: GraphNote[]
  edges: GraphRelationship[]
  selectedId: string | null
  connectionExplorationId: string | null
  cameraResetKey: number
  cameraCenterKey: number
  zoomCommand: { key: number; direction: -1 | 1 }
  onCameraChange: (snapshot: GalaxyCameraSnapshot) => void
  hoveredId: string | null
  highlightIds: string[] | null
  pathIds: string[] | null
  traversalIds: string[] | null
  pathPulseKey: number
  visualEvent: { key: number; kind: 'create' | 'delete' | 'relationship'; noteId?: string; sourceId?: string; targetId?: string; position?: [number, number, number] } | null
  onVisualEventComplete: (key: number) => void
  onSelect: (note: GraphNote) => void
  onHover: (id: string | null) => void
  onBackgroundClick: () => void
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
const knownNodeTypes = new Set(['CONCEPT', 'RESOURCE', 'QUESTION', 'SUMMARY'])
const fallbackNodeColors = ['#e5dbc5', '#a9c0cc', '#d6b16f', '#c99584']
const flowTrailOffsets = [0, 0.055, 0.11] as const
const idleGlowColor = new THREE.Color('#35444d')
const hoverGlowColor = new THREE.Color('#718a94')
const activeGlowColor = new THREE.Color('#62d8ff')
const traversalGlowColor = new THREE.Color('#83e2ff')
const pathGlowColor = new THREE.Color('#d9f5ff')
const idlePulseCoreColor = new THREE.Color('#637782')
const activePulseCoreColor = new THREE.Color('#e8fbff')
const traversalPulseCoreColor = new THREE.Color('#e3fbff')
const pathPulseCoreColor = new THREE.Color('#f5fdff')
const pulseColorScratch = new THREE.Color()

function deriveTraversalEdgeIds(traversalIds: string[], edges: GraphRelationship[]) {
  if (traversalIds.length < 2) return [] as string[]
  const expected = new Set(traversalIds)
  const edgeByPair = new Map<string, string>()
  const adjacency = new Map<string, string[]>(traversalIds.map((id) => [id, []]))
  for (const edge of edges) {
    if (!expected.has(edge.sourceNoteId) || !expected.has(edge.targetNoteId)) continue
    const key = [edge.sourceNoteId, edge.targetNoteId].sort().join('\u0000')
    edgeByPair.set(key, edge.id)
    adjacency.get(edge.sourceNoteId)?.push(edge.targetNoteId)
    adjacency.get(edge.targetNoteId)?.push(edge.sourceNoteId)
  }
  adjacency.forEach((neighbors) => neighbors.sort())
  const stack: Array<{ id: string; parent: string | null }> = [{ id: traversalIds[0], parent: null }]
  const visited = new Set<string>()
  const simulatedOrder: string[] = []
  const traversalEdges: string[] = []
  while (stack.length) {
    const current = stack.pop()!
    if (visited.has(current.id)) continue
    visited.add(current.id)
    simulatedOrder.push(current.id)
    if (current.parent) {
      const edgeId = edgeByPair.get([current.parent, current.id].sort().join('\u0000'))
      if (edgeId) traversalEdges.push(edgeId)
    }
    const neighbors = adjacency.get(current.id) ?? []
    for (let index = neighbors.length - 1; index >= 0; index -= 1) {
      const neighbor = neighbors[index]
      if (!visited.has(neighbor)) stack.push({ id: neighbor, parent: current.id })
    }
  }
  // Only animate when the returned backend order is exactly reproduced from the
  // current graph; otherwise show the normal highlight without inventing edges.
  return simulatedOrder.length === traversalIds.length && simulatedOrder.every((id, index) => id === traversalIds[index])
    ? traversalEdges
    : []
}

function compactNodeTitle(title: string) {
  const singleLine = title.replace(/\s+/g, ' ').trim()
  return singleLine.length > 30 ? `${singleLine.slice(0, 27).trimEnd()}…` : singleLine
}

type FloatingTextMesh = THREE.Mesh & { fillOpacity: number; outlineOpacity: number }

function NodeLabel({ title, offset, hovered, selected, onPath, focusEmphasis = false }: {
  title: string; offset: number; hovered: boolean; selected: boolean; onPath: boolean; focusEmphasis?: boolean
}) {
  const label = useRef<FloatingTextMesh>(null)
  const worldPosition = useRef(new THREE.Vector3())

  useFrame(({ camera }, delta) => {
    const text = label.current
    if (!text) return
    text.getWorldPosition(worldPosition.current)
    const distance = camera.position.distanceTo(worldPosition.current)
    const distanceFade = 1 - THREE.MathUtils.smoothstep(distance, 28, 42)
    const emphasis = selected ? 1 : hovered ? 0.86 : focusEmphasis ? 0.78 : onPath ? 0.72 : 0
    const visibility = emphasis > 0 ? Math.max(distanceFade, 0.78) : distanceFade
    const targetOpacity = (0.3 + emphasis * 0.68) * visibility
    const targetOutline = (0.11 + emphasis * 0.3) * visibility
    const targetScale = 1 + emphasis * 0.08
    text.fillOpacity = THREE.MathUtils.damp(text.fillOpacity, targetOpacity, 8, delta)
    text.outlineOpacity = THREE.MathUtils.damp(text.outlineOpacity, targetOutline, 8, delta)
    text.scale.setScalar(THREE.MathUtils.damp(text.scale.x, targetScale, 8, delta))
  })

  return <Billboard position={[0, offset, 0]} follow raycast={() => null}>
    <Text
      ref={label}
      fontSize={0.14}
      color="#e2e8eb"
      anchorX="center"
      anchorY="bottom"
      textAlign="center"
      whiteSpace="nowrap"
      maxWidth={3.2}
      fillOpacity={0.3}
      outlineWidth={0.018}
      outlineBlur={0.012}
      outlineColor="#82949d"
      outlineOpacity={0.11}
      depthOffset={-1}
      raycast={() => null}
    >
      {compactNodeTitle(title)}
    </Text>
  </Billboard>
}

function NoteNode({ note, position, active, hovered, selected, onPath, focusEmphasis = false, onSelect, onHover }: {
  note: GraphNote; position: [number, number, number]; active: boolean
  hovered: boolean; selected: boolean; onPath: boolean; focusEmphasis?: boolean
  onSelect: () => void; onHover: (id: string | null) => void
}) {
  const group = useRef<THREE.Group>(null)
  const phase = (hashText(note.id) % 1000) / 1000 * Math.PI * 2
  const reducedMotion = useRef(false)
  const radius = nodeRadius(note.importance)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotion.current = preference.matches }
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  useFrame((state, delta) => {
    if (!group.current) return
    const target = selected ? 1.1 : hovered ? 1.06 : active ? 1.035 : 1
    const breath = reducedMotion.current ? 1 : 1 + Math.sin(state.clock.elapsedTime * 0.72 + phase) * 0.008
    group.current.scale.setScalar(THREE.MathUtils.damp(group.current.scale.x, target * breath, 8, delta))
  })

  return <group ref={group} position={position}>
    <mesh
      scale={Math.max(0.34, radius * 2.1)}
      onClick={(event) => { event.stopPropagation(); onSelect() }}
      onPointerOver={(event) => { event.stopPropagation(); onHover(note.id); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { onHover(null); document.body.style.cursor = 'auto' }}
    >
      <primitive object={nodeSphereGeometry} attach="geometry" />
      <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
    </mesh>
    <NodeLabel title={note.title} offset={radius * (selected ? 2.7 : 2.4) + 0.08} hovered={hovered} selected={selected} onPath={onPath} focusEmphasis={focusEmphasis} />
  </group>
}

function CameraFocus({ focus, explorationActive, resetKey, centerKey, centerTarget, centerRadius, initialCameraPosition, zoomCommand, onCameraChange, frameDistance }: {
  focus: [number, number, number] | null; resetKey: number; centerKey: number
  explorationActive: boolean
  centerTarget: [number, number, number]; centerRadius: number; initialCameraPosition: [number, number, number]
  zoomCommand: GalaxyCanvasProps['zoomCommand']; onCameraChange: GalaxyCanvasProps['onCameraChange']
  frameDistance: number
}) {
  const { size, gl } = useThree()
  const controls = useRef<any>(null)
  const previousResetKey = useRef(resetKey)
  const previousCenterKey = useRef(centerKey)
  const previousExplorationActive = useRef(explorationActive)
  const previousFocus = useRef(focus)
  const previousZoomKey = useRef(zoomCommand.key)
  const lastCameraNotice = useRef(0)
  const reducedMotion = useRef(false)
  const zoomTargetDistance = useRef<number | null>(null)
  const zoomDirection = useMemo(() => new THREE.Vector3(), [])
  const transition = useRef<{
    fromTarget: THREE.Vector3; toTarget: THREE.Vector3
    fromPosition: THREE.Vector3; toPosition: THREE.Vector3; startedAt: number
  } | null>(null)
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotion.current = preference.matches }
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    const control = controls.current
    if (!control) return
    if (previousResetKey.current !== resetKey) {
      previousResetKey.current = resetKey
      previousCenterKey.current = centerKey
      zoomTargetDistance.current = null
      const fromTarget = control.target.clone()
      const toTarget = new THREE.Vector3(0, 0, 0)
      const fromPosition = control.object.position.clone()
      const toPosition = new THREE.Vector3(...initialCameraPosition)
      transition.current = { fromTarget, toTarget, fromPosition, toPosition, startedAt: performance.now() }
      return
    }
    if (previousCenterKey.current !== centerKey) {
      previousCenterKey.current = centerKey
      zoomTargetDistance.current = null
      const fromTarget = control.target.clone()
      const toTarget = new THREE.Vector3(...centerTarget)
      const fromPosition = control.object.position.clone()
      const cameraOffset = fromPosition.clone().sub(fromTarget)
      const camera = control.object as THREE.PerspectiveCamera
      const halfVerticalFov = THREE.MathUtils.degToRad(camera.fov / 2)
      const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * camera.aspect)
      const limitingHalfFov = Math.min(halfVerticalFov, halfHorizontalFov)
      const fitDistance = centerRadius / Math.max(0.05, Math.sin(limitingHalfFov)) * 1.12
      const targetDistance = THREE.MathUtils.clamp(fitDistance, control.minDistance, control.maxDistance)
      cameraOffset.setLength(targetDistance)
      const toPosition = toTarget.clone().add(cameraOffset)
      transition.current = { fromTarget, toTarget, fromPosition, toPosition, startedAt: performance.now() }
      return
    }
    if (previousExplorationActive.current !== explorationActive) {
      previousExplorationActive.current = explorationActive
      previousFocus.current = focus
      transition.current = null
      zoomTargetDistance.current = null
      return
    }
    if (explorationActive) {
      previousFocus.current = focus
      transition.current = null
      zoomTargetDistance.current = null
      return
    }
    if (previousFocus.current === focus) return
    previousFocus.current = focus
    // Deselecting returns to the galaxy by restoring its normal emphasis; preserve the
    // user's current orbit target and zoom instead of pulling the camera to the origin.
    if (!focus) { transition.current = null; return }

    zoomTargetDistance.current = null
    const fromTarget = control.target.clone()
    const toTarget = focus ? new THREE.Vector3(...focus) : new THREE.Vector3()
    const fromPosition = control.object.position.clone()
    const cameraOffset = fromPosition.clone().sub(fromTarget)
    // Keep the current orbit direction, but move in to a readable inspection
    // distance. Preserve a closer existing view rather than zooming back out.
    const focusDistance = THREE.MathUtils.clamp(Math.min(cameraOffset.length(), 12.5), control.minDistance, control.maxDistance)
    cameraOffset.setLength(focusDistance)
    const toPosition = toTarget.clone().add(cameraOffset)
    transition.current = { fromTarget, toTarget, fromPosition, toPosition, startedAt: performance.now() }
  }, [centerKey, centerRadius, centerTarget, explorationActive, focus, initialCameraPosition, resetKey])

  const requestZoom = useCallback((factor: number) => {
    const control = controls.current
    if (!control) return
    const camera = control.object as THREE.PerspectiveCamera
    const currentDistance = camera.position.distanceTo(control.target)
    const startingDistance = zoomTargetDistance.current ?? currentDistance
    zoomTargetDistance.current = THREE.MathUtils.clamp(startingDistance * factor, control.minDistance, control.maxDistance)
    transition.current = null
  }, [])

  useEffect(() => {
    if (previousZoomKey.current === zoomCommand.key) return
    previousZoomKey.current = zoomCommand.key
    // OrbitControls' three-stdlib dollyIn multiplies camera distance in this
    // version, so zooming toward the graph means reducing the distance.
    requestZoom(zoomCommand.direction > 0 ? 1 / 1.25 : 1.25)
  }, [requestZoom, zoomCommand])

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      requestZoom(Math.exp(THREE.MathUtils.clamp(event.deltaY, -240, 240) * 0.00125))
    }
    gl.domElement.addEventListener('wheel', handleWheel, { capture: true, passive: false })
    return () => gl.domElement.removeEventListener('wheel', handleWheel, true)
  }, [gl, requestZoom])

  useEffect(() => {
    const control = controls.current
    if (!control) return
    const forward = new THREE.Vector3()
    const right = new THREE.Vector3()
    const up = new THREE.Vector3()
    const publishView = (force = false) => {
      const now = performance.now()
      if (!force && now - lastCameraNotice.current < 90) return
      lastCameraNotice.current = now
      const offset = control.object.position.clone().sub(control.target)
      const camera = control.object as THREE.PerspectiveCamera
      camera.updateMatrixWorld()
      camera.getWorldDirection(forward)
      right.set(1, 0, 0).applyQuaternion(camera.quaternion)
      up.set(0, 1, 0).applyQuaternion(camera.quaternion)
      onCameraChange({
        x: control.target.x, z: control.target.z, distance: offset.length(),
        position: [camera.position.x, camera.position.y, camera.position.z],
        forward: [forward.x, forward.y, forward.z], right: [right.x, right.y, right.z], up: [up.x, up.y, up.z],
        target: [control.target.x, control.target.y, control.target.z],
        fov: camera.fov, aspect: camera.aspect, near: camera.near,
      })
    }
    const handleChange = () => publishView()
    control.addEventListener('change', handleChange)
    publishView(true)
    return () => control.removeEventListener('change', handleChange)
  }, [onCameraChange, size.height, size.width])

  useEffect(() => {
    const control = controls.current
    if (!control) return
    const stopFocusForManualOrbit = () => { transition.current = null; zoomTargetDistance.current = null }
    control.addEventListener('start', stopFocusForManualOrbit)
    return () => control.removeEventListener('start', stopFocusForManualOrbit)
  }, [])

  useFrame((_, delta) => {
    const control = controls.current
    if (control && zoomTargetDistance.current !== null) {
      const camera = control.object as THREE.PerspectiveCamera
      zoomDirection.subVectors(camera.position, control.target)
      const distance = zoomDirection.length()
      const nextDistance = reducedMotion.current
        ? zoomTargetDistance.current
        : THREE.MathUtils.damp(distance, zoomTargetDistance.current, 11, delta)
      camera.position.copy(control.target).addScaledVector(zoomDirection.normalize(), nextDistance)
      control.update()
      if (Math.abs(nextDistance - zoomTargetDistance.current) < 0.015) {
        camera.position.copy(control.target).addScaledVector(zoomDirection.normalize(), zoomTargetDistance.current)
        zoomTargetDistance.current = null
        control.update()
      }
    }
    const movement = transition.current
    if (!control || !movement) return
    const linear = reducedMotion.current ? 1 : Math.min(1, (performance.now() - movement.startedAt) / 850)
    const eased = linear * linear * (3 - 2 * linear)
    control.target.lerpVectors(movement.fromTarget, movement.toTarget, eased)
    control.object.position.lerpVectors(movement.fromPosition, movement.toPosition, eased)
    control.update()
    if (linear >= 1) transition.current = null
  })
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.075} minDistance={5} maxDistance={Math.max(48, frameDistance * 2.4)} rotateSpeed={0.55} />
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

function createStarNodeGeometry(
  notes: GraphNote[],
  positions: Map<string, [number, number, number]>,
  edges: GraphRelationship[],
  emphasisIds: Set<string> | null,
  pathIds: string[] | null,
) {
  const points: number[] = []
  const colors: number[] = []
  const sizes: number[] = []
  const phases: number[] = []
  const spikeStrengths: number[] = []
  const emphasized: number[] = []
  const onPath: number[] = []
  const nodeIndices: number[] = []
  const degrees = new Map(notes.map((note) => [note.id, 0]))
  for (const edge of edges) {
    degrees.set(edge.sourceNoteId, (degrees.get(edge.sourceNoteId) ?? 0) + 1)
    degrees.set(edge.targetNoteId, (degrees.get(edge.targetNoteId) ?? 0) + 1)
  }
  const pathSet = pathIds ? new Set(pathIds) : null

  notes.forEach((note, nodeIndex) => {
    const point = positions.get(note.id)
    if (!point) return
    const seed = hashText(note.id)
    const degree = degrees.get(note.id) ?? 0
    const color = new THREE.Color(knownNodeTypes.has(note.type.toUpperCase()) ? nodeColor(note.type) : fallbackNodeColors[seed % fallbackNodeColors.length])
    color.multiplyScalar(0.9 + ((seed >>> 20) % 201) / 1000)
    points.push(...point)
    colors.push(color.r, color.g, color.b)
    // Keep even low-importance notes visibly readable at the default camera
    // distance; importance and graph degree still create a clear hierarchy.
    sizes.push(Math.max(0.42, nodeRadius(note.importance) * 1.65 + Math.min(0.2, Math.sqrt(degree) * 0.04)) * 1.22 * 1.65 * 1.18)
    phases.push((seed % 1000) / 1000 * Math.PI * 2)
    spikeStrengths.push(Math.min(1, 0.28 + note.importance / 150 + Math.sqrt(degree) * 0.09))
    emphasized.push(emphasisIds?.has(note.id) ? 1 : 0)
    onPath.push(pathSet?.has(note.id) ? 1 : 0)
    nodeIndices.push(nodeIndex)
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1))
  geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1))
  geometry.setAttribute('aSpikes', new THREE.Float32BufferAttribute(spikeStrengths, 1))
  geometry.setAttribute('aEmphasized', new THREE.Float32BufferAttribute(emphasized, 1))
  geometry.setAttribute('aPath', new THREE.Float32BufferAttribute(onPath, 1))
  geometry.setAttribute('aNodeIndex', new THREE.Float32BufferAttribute(nodeIndices, 1))
  return geometry
}

// Three shared point buffers form a small, shallow 3D spiral system around each
// real note position. The arm particles are deterministic per note and rotate
// together in the vertex shader, avoiding per-node meshes or frame allocations.
function createNodeGalaxyGeometry(notes: GraphNote[], positions: Map<string, [number, number, number]>, emphasisIds: Set<string> | null) {
  const points: number[] = [], centers: number[] = [], colors: number[] = [], emphasized: number[] = []
  const sizes: number[] = [], phases: number[] = [], alphas: number[] = [], spins: number[] = [], indices: number[] = []
  const accents: Record<string, string> = {
    CONCEPT: '#a9b8f3', RESOURCE: '#fff0c7', QUESTION: '#e7a3d1', SUMMARY: '#b9deef',
  }
  notes.forEach((note, nodeIndex) => {
    const center = positions.get(note.id)
    if (!center) return
    const seed = hashText(note.id)
    const random = createRandom(seed ^ 0x6e656275)
    const type = note.type.toUpperCase()
    const base = new THREE.Color(nodeColor(type))
    const accent = new THREE.Color(accents[type] ?? '#d7e1e5')
    const radius = 0.42 + Math.max(0, Math.min(100, note.importance)) * 0.004
    const spin = 0.045 + (seed % 29) * 0.0018
    const orientation = random() * Math.PI * 2
    const orientationCos = Math.cos(orientation), orientationSin = Math.sin(orientation)
    const flatten = 0.58 + random() * 0.3
    const tilt = (random() - 0.5) * 0.72
    const addParticle = (x: number, y: number, z: number, size: number, alpha: number) => {
      const color = base.clone().lerp(accent, 0.14 + random() * 0.38).multiplyScalar(0.78 + random() * 0.4)
      points.push(center[0] + x, center[1] + y, center[2] + z)
      centers.push(...center); colors.push(color.r, color.g, color.b)
      emphasized.push(emphasisIds?.has(note.id) ? 1 : 0)
      sizes.push(size); phases.push(random() * Math.PI * 2); alphas.push(alpha * (0.78 + random() * 0.22))
      spins.push(spin * (0.78 + random() * 0.44)); indices.push(nodeIndex)
    }
    const armCount = 3, particlesPerArm = 126
    for (let arm = 0; arm < armCount; arm += 1) {
      for (let particle = 0; particle < particlesPerArm; particle += 1) {
        const progress = (particle + random() * 0.45) / particlesPerArm
        const radial = radius * (0.14 + progress * 0.83)
        const angle = arm * (Math.PI * 2 / armCount) + progress * 12.2 + (random() - 0.5) * 0.2
        const planarX = Math.cos(angle) * radial
        const planarZ = Math.sin(angle) * radial * flatten
        const x = planarX * orientationCos - planarZ * orientationSin
        const z = planarX * orientationSin + planarZ * orientationCos
        const y = (random() - 0.5) * radius * 0.22 + x * tilt
        addParticle(x, y, z, 0.058 + random() * 0.027, 0.62 + random() * 0.3)
      }
    }
    for (let particle = 0; particle < 58; particle += 1) {
      const angle = random() * Math.PI * 2
      const radial = radius * (0.12 + Math.sqrt(random()) * 0.91)
      const planarX = Math.cos(angle) * radial
      const planarZ = Math.sin(angle) * radial * flatten
      const x = planarX * orientationCos - planarZ * orientationSin
      const z = planarX * orientationSin + planarZ * orientationCos
      addParticle(x, (random() - 0.5) * radius * 0.3 + x * tilt, z, 0.032 + random() * 0.024, 0.32 + random() * 0.34)
    }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  geometry.setAttribute('aCenter', new THREE.Float32BufferAttribute(centers, 3))
  geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('aEmphasized', new THREE.Float32BufferAttribute(emphasized, 1))
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1))
  geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1))
  geometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alphas, 1))
  geometry.setAttribute('aSpin', new THREE.Float32BufferAttribute(spins, 1))
  geometry.setAttribute('aNodeIndex', new THREE.Float32BufferAttribute(indices, 1))
  return geometry
}

function createNodeGalaxyArmsGeometry(notes: GraphNote[], positions: Map<string, [number, number, number]>, emphasisIds: Set<string> | null) {
  const points: number[] = [], centers: number[] = [], colors: number[] = [], spins: number[] = [], alphas: number[] = [], emphasized: number[] = []
  const accents: Record<string, string> = {
    CONCEPT: '#a9b8f3', RESOURCE: '#fff0c7', QUESTION: '#e7a3d1', SUMMARY: '#b9deef',
  }
  notes.forEach((note) => {
    const center = positions.get(note.id)
    if (!center) return
    const seed = hashText(note.id)
    const random = createRandom(seed ^ 0x73706972)
    const type = note.type.toUpperCase()
    const base = new THREE.Color(nodeColor(type)).lerp(new THREE.Color(accents[type] ?? '#d7e1e5'), 0.32)
    const radius = 0.42 + Math.max(0, Math.min(100, note.importance)) * 0.004
    const orientation = random() * Math.PI * 2
    const orientationCos = Math.cos(orientation), orientationSin = Math.sin(orientation)
    const flatten = 0.58 + random() * 0.3
    const tilt = (random() - 0.5) * 0.72
    const spin = 0.045 + (seed % 29) * 0.0018
    const armCount = 3, segments = 54
    for (let arm = 0; arm < armCount; arm += 1) {
      let previous: [number, number, number] | null = null
      for (let step = 0; step <= segments; step += 1) {
        const progress = step / segments
        const radial = radius * (0.12 + progress * 0.86)
        const angle = arm * (Math.PI * 2 / armCount) + progress * 12.2
        const planarX = Math.cos(angle) * radial
        const planarZ = Math.sin(angle) * radial * flatten
        const x = planarX * orientationCos - planarZ * orientationSin
        const z = planarX * orientationSin + planarZ * orientationCos
        const point: [number, number, number] = [center[0] + x, center[1] + x * tilt + Math.sin(progress * Math.PI * 4 + arm) * radius * 0.045, center[2] + z]
        if (previous) {
          for (const endpoint of [previous, point]) {
            points.push(...endpoint); centers.push(...center)
            colors.push(base.r, base.g, base.b); spins.push(spin)
            emphasized.push(emphasisIds?.has(note.id) ? 1 : 0)
            alphas.push((0.3 + (1 - progress) * 0.54) * (0.82 + random() * 0.18))
          }
        }
        previous = point
      }
    }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  geometry.setAttribute('aCenter', new THREE.Float32BufferAttribute(centers, 3))
  geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('aSpin', new THREE.Float32BufferAttribute(spins, 1))
  geometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alphas, 1))
  geometry.setAttribute('aEmphasized', new THREE.Float32BufferAttribute(emphasized, 1))
  return geometry
}

function NodeGalaxyParticles({ notes, positions, selectedId, hoveredId, emphasisIds, explorationActive }: {
  notes: GraphNote[]; positions: Map<string, [number, number, number]>; selectedId: string | null; hoveredId: string | null
  emphasisIds: Set<string> | null; explorationActive: boolean
}) {
  const { size, gl, camera } = useThree()
  const reducedMotion = useRef(false)
  const shader = useRef<THREE.ShaderMaterial>(null)
  const armShader = useRef<THREE.ShaderMaterial>(null)
  const geometry = useMemo(() => createNodeGalaxyGeometry(notes, positions, emphasisIds), [notes, positions, emphasisIds])
  const armGeometry = useMemo(() => createNodeGalaxyArmsGeometry(notes, positions, emphasisIds), [notes, positions, emphasisIds])
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelScale: { value: 1 }, uSelectedNode: { value: -1 }, uHoveredNode: { value: -1 }, uExplorationActive: { value: 0 } },
    vertexShader: `
      attribute vec3 aCenter; attribute vec3 aColor; attribute float aSize; attribute float aPhase;
      attribute float aAlpha; attribute float aSpin; attribute float aNodeIndex; attribute float aEmphasized;
      uniform float uTime; uniform float uPixelScale; uniform float uSelectedNode; uniform float uHoveredNode; uniform float uExplorationActive;
      varying vec3 vColor; varying float vAlpha; varying float vPhase; varying float vVisibility;
      void main() {
        float selected = 1.0 - step(0.5, abs(aNodeIndex - uSelectedNode));
        float hovered = 1.0 - step(0.5, abs(aNodeIndex - uHoveredNode));
        vec3 local = position - aCenter;
        float angle = uTime * aSpin + aPhase * 0.025;
        float c = cos(angle), s = sin(angle);
        vec3 rotated = vec3(c * local.x + s * local.z, local.y, -s * local.x + c * local.z);
        vec4 viewPosition = modelViewMatrix * vec4(aCenter + rotated, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = clamp(aSize * uPixelScale / max(-viewPosition.z, 0.1), 1.1, 6.0);
        vColor = mix(aColor, vec3(0.86, 0.94, 1.0), selected * 0.3 + hovered * 0.18);
        vAlpha = aAlpha * (1.0 + selected * 0.18 + hovered * 0.12);
        vVisibility = mix(1.0, mix(0.018, 1.0, aEmphasized), uExplorationActive);
        vPhase = aPhase;
      }
    `,
    fragmentShader: `
      uniform float uTime; varying vec3 vColor; varying float vAlpha; varying float vPhase; varying float vVisibility;
      void main() {
        vec2 point = gl_PointCoord * 2.0 - 1.0;
        float radius = length(point);
        if (radius > 1.0) discard;
        float grain = exp(-radius * radius * 10.0);
        float halo = exp(-radius * radius * 2.3);
        float twinkle = 0.88 + 0.12 * sin(uTime * 0.68 + vPhase * 4.0);
        float alpha = (grain * 0.68 + halo * 0.28) * vAlpha * twinkle * vVisibility;
        if (alpha < 0.008) discard;
        gl_FragColor = vec4(vColor * (1.15 + grain * 0.8), alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }), [])
  const armMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uExplorationActive: { value: 0 } },
    vertexShader: `
      attribute vec3 aCenter; attribute vec3 aColor; attribute float aSpin; attribute float aAlpha; attribute float aEmphasized;
      uniform float uTime; uniform float uExplorationActive; varying vec3 vColor; varying float vAlpha; varying float vEmphasized;
      void main() {
        vec3 local = position - aCenter;
        float angle = uTime * aSpin;
        float c = cos(angle), s = sin(angle);
        vec3 rotated = vec3(c * local.x + s * local.z, local.y, -s * local.x + c * local.z);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(aCenter + rotated, 1.0);
        vColor = aColor;
        vAlpha = aAlpha;
        vEmphasized = aEmphasized;
      }
    `,
    fragmentShader: `
      uniform float uExplorationActive; varying vec3 vColor; varying float vAlpha; varying float vEmphasized;
      void main() {
        float visibility = mix(1.0, mix(0.018, 1.0, vEmphasized), uExplorationActive);
        gl_FragColor = vec4(vColor * 1.25, vAlpha * 0.26 * visibility);
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }), [])
  const selectedIndex = useMemo(() => selectedId ? notes.findIndex((note) => note.id === selectedId) : -1, [notes, selectedId])
  const hoveredIndex = useMemo(() => hoveredId ? notes.findIndex((note) => note.id === hoveredId) : -1, [notes, hoveredId])
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotion.current = preference.matches }
    update(); preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    const perspective = camera instanceof THREE.PerspectiveCamera ? 1 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) : 1
    if (shader.current) shader.current.uniforms.uPixelScale.value = size.height * gl.getPixelRatio() * perspective
  }, [camera, gl, material, size.height])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => armGeometry.dispose(), [armGeometry])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => () => armMaterial.dispose(), [armMaterial])
  useFrame(({ clock }) => {
    const activeShader = shader.current
    if (!activeShader) return
    activeShader.uniforms.uTime.value = reducedMotion.current ? 0 : clock.elapsedTime
    activeShader.uniforms.uSelectedNode.value = selectedIndex
    activeShader.uniforms.uHoveredNode.value = hoveredIndex
    activeShader.uniforms.uExplorationActive.value = explorationActive ? 1 : 0
    if (armShader.current) {
      armShader.current.uniforms.uTime.value = reducedMotion.current ? 0 : clock.elapsedTime
      armShader.current.uniforms.uExplorationActive.value = explorationActive ? 1 : 0
    }
  })
  return <group raycast={() => null}>
    <lineSegments geometry={armGeometry} frustumCulled={false} renderOrder={1} raycast={() => null}>
      <primitive object={armMaterial} ref={armShader} attach="material" />
    </lineSegments>
    <points geometry={geometry} frustumCulled={false} renderOrder={1} raycast={() => null}>
      <primitive object={material} ref={shader} attach="material" />
    </points>
  </group>
}

function StarNodeField({ notes, edges, positions, selectedId, hoveredId, emphasisIds, pathIds, explorationActive }: {
  notes: GraphNote[]
  edges: GraphRelationship[]
  positions: Map<string, [number, number, number]>
  selectedId: string | null
  hoveredId: string | null
  emphasisIds: Set<string> | null
  pathIds: string[] | null
  explorationActive: boolean
}) {
  const { size, gl, camera } = useThree()
  const reducedMotion = useRef(false)
  const shaderMaterial = useRef<THREE.ShaderMaterial>(null)
  const geometry = useMemo(() => createStarNodeGeometry(notes, positions, edges, emphasisIds, pathIds), [notes, positions, edges, emphasisIds, pathIds])
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uPixelScale: { value: 1 },
      uSelectedNode: { value: -1 }, uHoveredNode: { value: -1 },
      uHasFocus: { value: 0 },
      uExplorationActive: { value: 0 },
    },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aPhase;
      attribute float aSpikes;
      attribute float aEmphasized;
      attribute float aPath;
      attribute float aNodeIndex;
      uniform float uPixelScale;
      uniform float uSelectedNode;
      uniform float uHoveredNode;
      uniform float uHasFocus;
      uniform float uExplorationActive;
      varying vec3 vColor;
      varying float vOpacity;
      varying float vRotation;
      varying float vSpikes;
      varying float vBrightness;
      void main() {
        float selected = 1.0 - step(0.5, abs(aNodeIndex - uSelectedNode));
        float hovered = 1.0 - step(0.5, abs(aNodeIndex - uHoveredNode));
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float emphasis = max(aEmphasized, max(selected, max(hovered, aPath)));
        float focusBoost = selected * 0.55 + hovered * 0.3 + aPath * 0.38;
        float regularVisibility = mix(1.0, mix(0.68, 0.98, emphasis), uHasFocus);
        float visibility = mix(regularVisibility, mix(0.014, 1.0, emphasis), uExplorationActive);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = clamp(aSize * uPixelScale / max(-viewPosition.z, 0.1) * (1.0 + selected * 0.2 + hovered * 0.1), 18.0, 96.0);
        vColor = mix(aColor, vec3(1.0), min(0.42, 0.12 + focusBoost * 0.22));
        vOpacity = visibility * (0.94 + focusBoost * 0.06);
        vRotation = aPhase;
        vSpikes = aSpikes * (0.82 + selected * 0.55 + hovered * 0.28 + aPath * 0.34);
        vBrightness = 1.22 + focusBoost * 0.72;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vColor;
      varying float vOpacity;
      varying float vRotation;
      varying float vSpikes;
      varying float vBrightness;
      void main() {
        vec2 point = (gl_PointCoord - 0.5) * 2.0;
        float cs = cos(vRotation);
        float sn = sin(vRotation);
        vec2 p = mat2(cs, -sn, sn, cs) * point;
        float radius = length(p);
        if (radius > 1.0) discard;
        float core = exp(-radius * radius * 32.0);
        float photosphere = exp(-radius * radius * 13.0);
        float innerHalo = exp(-radius * radius * 5.2);
        float softHalo = exp(-radius * radius * 1.8);
        float spikeX = exp(-abs(p.y) * 20.0) * exp(-abs(p.x) * 2.35);
        float spikeY = exp(-abs(p.x) * 20.0) * exp(-abs(p.y) * 2.35);
        float spikeD1 = exp(-abs(p.x - p.y) * 18.0) * exp(-abs(p.x + p.y) * 3.0);
        float spikeD2 = exp(-abs(p.x + p.y) * 18.0) * exp(-abs(p.x - p.y) * 3.0);
        float spikes = max(spikeX, spikeY) + max(spikeD1, spikeD2) * 0.22;
        float twinkle = 0.96 + 0.04 * sin(uTime * 0.72 + vRotation * 1.7);
        float alpha = (core * 1.0 + photosphere * 0.48 + innerHalo * 0.31 + softHalo * 0.1 + spikes * vSpikes * 0.18) * vOpacity * twinkle;
        if (alpha < 0.006) discard;
        vec3 color = mix(vColor * 0.76, vec3(1.0), core * 0.9);
        color *= (1.12 + core * 1.24 + photosphere * 0.28 + spikes * vSpikes * 0.24) * vBrightness;
        gl_FragColor = vec4(color, min(alpha, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }), [])
  const selectedIndex = useMemo(() => selectedId ? notes.findIndex((note) => note.id === selectedId) : -1, [notes, selectedId])
  const hoveredIndex = useMemo(() => hoveredId ? notes.findIndex((note) => note.id === hoveredId) : -1, [notes, hoveredId])

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotion.current = preference.matches }
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    const perspective = camera instanceof THREE.PerspectiveCamera ? 1 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) : 1
    if (shaderMaterial.current) shaderMaterial.current.uniforms.uPixelScale.value = size.height * gl.getPixelRatio() * perspective
  }, [camera, gl, material, size.height])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  useFrame((state) => {
    const shader = shaderMaterial.current
    if (!shader) return
    shader.uniforms.uTime.value = reducedMotion.current ? 0 : state.clock.elapsedTime
    shader.uniforms.uSelectedNode.value = selectedIndex
    shader.uniforms.uHoveredNode.value = hoveredIndex
    shader.uniforms.uHasFocus.value = emphasisIds ? 1 : 0
    shader.uniforms.uExplorationActive.value = explorationActive ? 1 : 0
  })
  return <points geometry={geometry} frustumCulled={false} renderOrder={2} raycast={() => null}>
    <primitive object={material} ref={shaderMaterial} attach="material" />
  </points>
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
        float broadCloud = smoothstep(0.05, 0.46, fbm(p * 0.38 + vec3(5.4, 2.1, 9.3)));
        float cloud = smoothstep(0.06, 0.48, fbm(p * 0.86 + vec3(warp * 1.4, -warp * 0.7, warp)));
        float filaments = smoothstep(0.34, 0.75, fbm(p * 2.1 + vec3(2.0, 7.0, 1.0)));
        float region = smoothstep(-0.28, 0.2, fbm(vDirection * 2.2 + vec3(4.0, 9.0, 2.0)));
        float viewAngle = 1.0 - dot(normalize(vDirection), normalize(uViewDirection));
        float clearCenter = smoothstep(0.1, 0.42, viewAngle);
        float cloudMass = cloud * (0.42 + broadCloud * 0.9);
        float warmDust = smoothstep(-0.05, 0.35, warp);
        float coolDust = smoothstep(0.28, 0.55, noise(p * 0.63 + vec3(12.0)));
        float scatteredOpacity = cloudMass * region * clearCenter * (0.1 + filaments * 0.18);
        float nebulaShape = smoothstep(0.01, 0.2, broadCloud * 0.75 + cloud * 0.8);
        float nebulaVeil = nebulaShape * (0.32 + filaments * 0.22) * mix(0.55, 1.0, clearCenter);

        // A warped great-circle band gives the deep field a broad, irregular
        // Milky Way structure while leaving a subdued opening behind the graph.
        vec3 galacticNormal = normalize(vec3(-0.62, 0.72, -0.16));
        float bandDist = dot(normalize(vDirection), galacticNormal);
        float bandWarp = noise(p * 0.31 + vec3(16.0, 4.0, 11.0)) * 0.045;
        float warpedDist = bandDist + bandWarp;
        float band = exp(-pow(warpedDist * 4.1, 2.0));
        float brightLane = exp(-pow(warpedDist * 11.0, 2.0));
        float bandClouds = smoothstep(0.04, 0.62, fbm(p * 0.42 + vec3(13.0, 6.0, 3.0)));
        float bandCenterLift = mix(0.42, 1.0, clearCenter);
        float bandOpacity = band * (0.32 + bandClouds * 0.68) * bandCenterLift * (0.24 + brightLane * 0.24);

        vec3 scatteredColor = mix(vec3(0.028, 0.04, 0.068), vec3(0.12, 0.082, 0.14), warmDust);
        scatteredColor = mix(scatteredColor, vec3(0.08, 0.105, 0.17), coolDust * 0.7);
        scatteredColor = mix(scatteredColor, vec3(0.12, 0.058, 0.11), coolDust * warmDust * 0.34);
        vec3 bandColor = mix(vec3(0.095, 0.13, 0.2), vec3(0.19, 0.23, 0.32), bandClouds * 0.72);
        float violetDust = smoothstep(0.48, 0.78, noise(p * 0.48 + vec3(7.0, 17.0, 2.0))) * cloudMass;
        bandColor = mix(bandColor, vec3(0.23, 0.16, 0.29), smoothstep(0.42, 0.78, noise(p * 0.58 + vec3(7.0, 17.0, 2.0))) * 0.64);
        bandColor = mix(bandColor, vec3(0.2, 0.12, 0.28), violetDust * 0.38);
        bandColor = mix(bandColor, vec3(0.30, 0.22, 0.13), smoothstep(0.52, 0.8, warmDust) * smoothstep(0.35, 0.8, bandClouds) * 0.42);
        bandColor += vec3(0.035, 0.04, 0.055) * brightLane;
        vec3 color = mix(scatteredColor, bandColor, smoothstep(0.06, 0.72, band));
        vec3 diffuseNebula = mix(vec3(0.105, 0.15, 0.245), vec3(0.2, 0.12, 0.26), warmDust * 0.45 + violetDust * 0.28);
        color = mix(color, diffuseNebula, nebulaVeil * 0.8);
        gl_FragColor = vec4(color, max(nebulaVeil, max(scatteredOpacity, bandOpacity)));
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
    <meshBasicMaterial color="#bfe5ed" transparent opacity={0.9} />
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
  const amplitude = strandIndex === 0 ? 0.015 : 0.015
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

interface TubeBuffers { positions: number[]; normals: number[]; indices: number[]; edgeIndices: number[]; pathProgress: number[]; edgeVisibility: number[] }
interface BeamEmphasis { selected: number; bfs: number; hover: number }

function appendPlasmaTube(target: TubeBuffers, curve: THREE.CatmullRomCurve3, radius: number, edgeIndex: number, visibility: number, tubularSegments = 64, radialSegments = 6) {
  const tube = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false)
  const positions = tube.getAttribute('position').array
  const normals = tube.getAttribute('normal').array
  const uv = tube.getAttribute('uv').array
  const indices = tube.getIndex()?.array
  const vertexOffset = target.positions.length / 3
  for (let index = 0; index < positions.length; index += 1) target.positions.push(positions[index])
  for (let index = 0; index < normals.length; index += 1) target.normals.push(normals[index])
  for (let index = 0; index < positions.length / 3; index += 1) {
    target.edgeIndices.push(edgeIndex)
    target.pathProgress.push(uv[index * 2 + 1])
    target.edgeVisibility.push(visibility)
  }
  if (indices) for (let index = 0; index < indices.length; index += 1) target.indices.push(indices[index] + vertexOffset)
  tube.dispose()
}

function PlasmaNetwork({ connections, emphasisByEdge, traversalEdgeIds, explorationActive }: {
  connections: VisibleEdge[]
  emphasisByEdge: Map<string, BeamEmphasis>
  traversalEdgeIds: string[]
  explorationActive: boolean
}) {
  const edgeStates = useRef(new Map<string, { selected: number; bfs: number; traversal: number; hover: number }>())
  const edgeStateTextureRef = useRef<THREE.DataTexture | null>(null)
  const traversalStart = useRef<number | null>(null)
  const reducedMotion = useRef(false)
  const traversalOrder = useMemo(() => new Map(traversalEdgeIds.map((id, index) => [id, index])), [traversalEdgeIds])
  const geometryData = useMemo(() => {
    const buffer: TubeBuffers = { positions: [], normals: [], indices: [], edgeIndices: [], pathProgress: [], edgeVisibility: [] }
    const edgeIndices = new Map<string, number>()
    connections.forEach((connection, edgeIndex) => {
      edgeIndices.set(connection.edge.id, edgeIndex)
      const from = new THREE.Vector3(...connection.source)
      const to = new THREE.Vector3(...connection.target)
      const curve = createPlasmaStrand(from, to, hashText(connection.edge.id), 0).curve
      // Nearby constellation edges remain legible; long links between clusters
      // recede into the field while the shader can still emphasize active paths.
      const distance = from.distanceTo(to)
      const visibility = THREE.MathUtils.clamp(1.12 - distance * 0.055, 0.6, 0.95)
      appendPlasmaTube(buffer, curve, 0.0065, edgeIndex, visibility, 96, 4)
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffer.positions, 3))
    geometry.setAttribute('aTubeNormal', new THREE.Float32BufferAttribute(buffer.normals, 3))
    geometry.setAttribute('aEdgeIndex', new THREE.Float32BufferAttribute(buffer.edgeIndices, 1))
    geometry.setAttribute('aPathProgress', new THREE.Float32BufferAttribute(buffer.pathProgress, 1))
    geometry.setAttribute('aEdgeVisibility', new THREE.Float32BufferAttribute(buffer.edgeVisibility, 1))
    if (buffer.indices.length) geometry.setIndex(buffer.indices)
    return { geometry, edgeIndices }
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
      if (!edgeStates.current.has(connection.edge.id)) edgeStates.current.set(connection.edge.id, { selected: 0, bfs: 0, traversal: 0, hover: 0 })
    })
  }, [connections])
  const materials = useMemo(() => {
    return [new THREE.ShaderMaterial({
      uniforms: {
        uEdgeState: { value: edgeStateTexture },
        uEdgeCount: { value: edgeCount },
        uTime: { value: 0 },
        uBaseColor: { value: new THREE.Color('#90a6b1') },
        uSelectedColor: { value: new THREE.Color('#c7efff') },
        uTraversalColor: { value: new THREE.Color('#d8f7ff') },
        uBfsColor: { value: new THREE.Color('#f0fbff') },
        uHoverColor: { value: new THREE.Color('#9dc2d0') },
        uOpacity: { value: 0.62 },
        uExplorationActive: { value: explorationActive ? 1 : 0 },
      },
      vertexShader: `
        uniform sampler2D uEdgeState;
        uniform float uEdgeCount;
        attribute float aEdgeIndex;
        attribute float aPathProgress;
        attribute float aEdgeVisibility;
        attribute vec3 aTubeNormal;
        varying float vEdgeIndex;
        varying float vPathProgress;
        varying float vEdgeVisibility;
        void main() {
          vec4 state = texture2D(uEdgeState, vec2((aEdgeIndex + 0.5) / uEdgeCount, 0.5));
          float selected = smoothstep(0.025, 0.86, state.r);
          float bfs = smoothstep(0.025, 0.86, state.g);
          float traversal = smoothstep(0.025, 0.86, state.b) * (1.0 - bfs);
          float hover = smoothstep(0.025, 0.86, state.a) * (1.0 - max(bfs, traversal));
          selected *= 1.0 - max(bfs, traversal);
          float activeWidth = max(selected, max(hover, max(traversal, bfs)));
          vec3 beamPosition = position + aTubeNormal * (activeWidth * 0.0033);
          vEdgeIndex = aEdgeIndex;
          vPathProgress = aPathProgress;
          vEdgeVisibility = aEdgeVisibility;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(beamPosition, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uEdgeState;
        uniform float uEdgeCount;
        uniform float uTime;
        uniform vec3 uBaseColor;
        uniform vec3 uSelectedColor;
        uniform vec3 uTraversalColor;
        uniform vec3 uBfsColor;
        uniform vec3 uHoverColor;
        uniform float uOpacity;
        uniform float uExplorationActive;
        varying float vEdgeIndex;
        varying float vPathProgress;
        varying float vEdgeVisibility;
        void main() {
          vec4 state = texture2D(uEdgeState, vec2((vEdgeIndex + 0.5) / uEdgeCount, 0.5));
          float selected = smoothstep(0.025, 0.86, state.r);
          float bfs = smoothstep(0.025, 0.86, state.g);
          float traversal = smoothstep(0.025, 0.86, state.b) * (1.0 - bfs);
          float hover = smoothstep(0.025, 0.86, state.a) * (1.0 - max(bfs, traversal));
          selected *= 1.0 - max(bfs, traversal);
          vec3 color = mix(uBaseColor, uSelectedColor, selected);
          color = mix(color, uTraversalColor, traversal);
          color = mix(color, uBfsColor, bfs);
          color = mix(color, uHoverColor, hover * 0.55);
          float focus = max(selected, max(hover, max(traversal, bfs)));
          float energy = 0.42 + selected * 1.65 + hover * 0.32 + traversal * 1.8 + bfs * 2.0;
          float idleOpacity = mix(0.56, 0.018, uExplorationActive);
          float selectedGain = mix(0.16, 0.72, uExplorationActive);
          float opacity = idleOpacity + selected * selectedGain + hover * 0.08 + traversal * 0.20 + bfs * 0.28;
          opacity *= mix(vEdgeVisibility, 1.0, focus * 0.82);
          float quietCurrent = (0.5 + 0.5 * sin(vPathProgress * 12.0 - uTime * 0.5 + vEdgeIndex)) * 0.025;
          float pulseForward = exp(-pow((vPathProgress - fract(uTime * 0.2 + vEdgeIndex * 0.37)) * 20.0, 2.0));
          float pulseReverse = exp(-pow((vPathProgress - (1.0 - fract(uTime * 0.2 + vEdgeIndex * 0.61))) * 20.0, 2.0));
          float flowingPackets = max(pulseForward, pulseReverse) * focus;
          float activeTrace = (0.5 + 0.5 * sin(vPathProgress * 22.0 - uTime * 1.2 + vEdgeIndex)) * focus * 0.08;
          gl_FragColor = vec4(color * (energy + quietCurrent + activeTrace + flowingPackets * 1.15), uOpacity * opacity);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })]
  }, [edgeCount, edgeStateTexture, explorationActive])
  useEffect(() => () => {
    geometryData.geometry.dispose()
    materials.forEach((material) => material.dispose())
    edgeStateTexture.dispose()
  }, [geometryData, materials, edgeStateTexture])
  useEffect(() => { edgeStateTextureRef.current = edgeStateTexture }, [edgeStateTexture])

  useEffect(() => { traversalStart.current = null }, [traversalEdgeIds])
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotion.current = preference.matches }
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  useFrame((state, delta) => {
    const texture = edgeStateTextureRef.current
    if (!texture) return
    if (traversalEdgeIds.length && traversalStart.current === null) traversalStart.current = state.clock.elapsedTime
    const elapsed = reducedMotion.current ? Number.POSITIVE_INFINITY : state.clock.elapsedTime - (traversalStart.current ?? state.clock.elapsedTime)
    const stateData = texture.image.data as Uint8Array
    materials.forEach((material) => { material.uniforms.uTime.value = reducedMotion.current ? 0 : state.clock.elapsedTime })
    for (const connection of connections) {
      const edgeIndex = geometryData.edgeIndices.get(connection.edge.id)
      const edgeState = edgeStates.current.get(connection.edge.id)
      if (edgeIndex === undefined || !edgeState) continue
      const emphasis = emphasisByEdge.get(connection.edge.id)
      const orderIndex = traversalOrder.get(connection.edge.id)
      const traversalDelay = orderIndex === undefined ? Number.POSITIVE_INFINITY : orderIndex * 0.12
      const targetTraversal = orderIndex === undefined ? 0 : reducedMotion.current ? 1 : THREE.MathUtils.clamp((elapsed - traversalDelay) / 0.24, 0, 1)
      const targetSelected = emphasis?.selected ?? 0
      const targetBfs = emphasis?.bfs ?? 0
      edgeState.selected = THREE.MathUtils.damp(edgeState.selected, targetSelected, 5.5, delta)
      edgeState.bfs = THREE.MathUtils.damp(edgeState.bfs, targetBfs, 6.5, delta)
      edgeState.traversal = THREE.MathUtils.damp(edgeState.traversal, targetTraversal, 7, delta)
      edgeState.hover = THREE.MathUtils.damp(edgeState.hover, emphasis?.hover ?? 0, 7, delta)
      const offset = edgeIndex * 4
      stateData[offset] = Math.round(edgeState.selected * 255)
      stateData[offset + 1] = Math.round(edgeState.bfs * 255)
      stateData[offset + 2] = Math.round(edgeState.traversal * 255)
      stateData[offset + 3] = Math.round(edgeState.hover * 255)
    }
    texture.needsUpdate = true
  })

  return <mesh geometry={geometryData.geometry} material={materials[0]} frustumCulled={false} renderOrder={0} raycast={() => null} />
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

function EnergyFlows({ connections, emphasisByEdge, traversalEdgeIds, arrivals }: {
  connections: VisibleEdge[]
  emphasisByEdge: Map<string, BeamEmphasis>
  traversalEdgeIds: string[]
  arrivals: Map<string, number>
}) {
  const coreMesh = useRef<THREE.InstancedMesh>(null)
  const glowMesh = useRef<THREE.InstancedMesh>(null)
  const transform = useRef(new THREE.Object3D())
  const lastCycles = useRef<number[]>([])
  const reducedMotion = useRef(false)
  const selectedValues = useRef(new Float32Array(0))
  const bfsValues = useRef(new Float32Array(0))
  const traversalValues = useRef(new Float32Array(0))
  const hoverValues = useRef(new Float32Array(0))
  const traversalStart = useRef<number | null>(null)
  const traversalOrder = useMemo(() => new Map(traversalEdgeIds.map((id, index) => [id, index])), [traversalEdgeIds])
  const flows = useMemo(() => connections.flatMap((connection) => {
    const seed = hashText(connection.edge.id)
    const from = new THREE.Vector3(...connection.source)
    const to = new THREE.Vector3(...connection.target)
    const strand = createPlasmaStrand(from, to, seed, 0)
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
  const glowMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), [])
  useEffect(() => () => { geometry.dispose(); coreMaterial.dispose(); glowMaterial.dispose() }, [geometry, coreMaterial, glowMaterial])
  useEffect(() => { lastCycles.current = Array.from({ length: flows.length }, () => -1) }, [flows])
  useEffect(() => { traversalStart.current = null }, [traversalEdgeIds])
  useEffect(() => {
    selectedValues.current = new Float32Array(flows.length)
    bfsValues.current = new Float32Array(flows.length)
    traversalValues.current = new Float32Array(flows.length)
    hoverValues.current = new Float32Array(flows.length)
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
    if (traversalEdgeIds.length && traversalStart.current === null) traversalStart.current = state.clock.elapsedTime
    const traversalElapsed = state.clock.elapsedTime - (traversalStart.current ?? state.clock.elapsedTime)
    const core = coreMesh.current
    const glow = glowMesh.current
    if (!core || !glow) return
    for (let flowIndex = 0; flowIndex < flows.length; flowIndex += 1) {
      const flow = flows[flowIndex]
      const emphasis = emphasisByEdge.get(flow.edgeId)
      selectedValues.current[flowIndex] = THREE.MathUtils.damp(selectedValues.current[flowIndex], emphasis?.selected ?? 0, 5.5, delta)
      bfsValues.current[flowIndex] = THREE.MathUtils.damp(bfsValues.current[flowIndex], emphasis?.bfs ?? 0, 6.5, delta)
      const traversalIndex = traversalOrder.get(flow.edgeId)
      const traversalTarget = traversalIndex === undefined ? 0 : reducedMotion.current ? 1 : THREE.MathUtils.clamp((traversalElapsed - traversalIndex * 0.12) / 0.24, 0, 1)
      traversalValues.current[flowIndex] = THREE.MathUtils.damp(traversalValues.current[flowIndex], traversalTarget, 7, delta)
      hoverValues.current[flowIndex] = THREE.MathUtils.damp(hoverValues.current[flowIndex], emphasis?.hover ?? 0, 7, delta)
      const selected = selectedValues.current[flowIndex]
      const bfs = bfsValues.current[flowIndex]
      const traversal = traversalValues.current[flowIndex]
      const hover = hoverValues.current[flowIndex]
      const glowEmphasis = Math.max(selected, traversal, bfs)
      pulseColorScratch.copy(idleGlowColor).lerp(hoverGlowColor, hover).lerp(activeGlowColor, selected).lerp(traversalGlowColor, traversal).lerp(pathGlowColor, bfs)
      for (let particleIndex = 0; particleIndex < 3; particleIndex += 1) glow.setColorAt(flowIndex * 3 + particleIndex, pulseColorScratch)
      pulseColorScratch.copy(idlePulseCoreColor).lerp(activePulseCoreColor, selected).lerp(traversalPulseCoreColor, traversal).lerp(pathPulseCoreColor, bfs)
      core.setColorAt(flowIndex, pulseColorScratch)
      const cycle = (elapsed * flow.speed + flow.phase) % 1
      if (!reducedMotion.current && glowEmphasis > 0.35 && lastCycles.current[flowIndex] < 0.92 && cycle >= 0.92) arrivals.set(flow.targetId, Math.min(elapsed + 0.34, Math.max(arrivals.get(flow.targetId) ?? 0, elapsed + 0.28)))
      lastCycles.current[flowIndex] = cycle
      const travel = Math.min(1, cycle / 0.92)
      const progress = flow.reverse ? 1 - travel : travel
      for (let particleIndex = 0; particleIndex < 3; particleIndex += 1) {
        const particleProgress = progress + (flow.reverse ? 1 : -1) * flowTrailOffsets[particleIndex]
        samplePath(flow.samples, THREE.MathUtils.clamp(particleProgress, 0, 1), flow.points[particleIndex])
        const inRange = particleProgress >= 0 && particleProgress <= 1
        transform.current.position.copy(flow.points[particleIndex])
        const glowScale = particleIndex === 0 ? 0.046 : particleIndex === 1 ? 0.032 : 0.021
        transform.current.scale.setScalar(glowScale * (0.025 + hover * 0.18 + glowEmphasis * 0.92))
        if (particleIndex > 0 && !inRange) transform.current.scale.setScalar(0)
        transform.current.updateMatrix()
        glow.setMatrixAt(flowIndex * 3 + particleIndex, transform.current.matrix)
      }
      const headProgress = progress
      samplePath(flow.samples, headProgress, flow.points[0])
      transform.current.position.copy(flow.points[0])
      transform.current.scale.setScalar(0.034 * (0.025 + hover * 0.2 + glowEmphasis * 0.96))
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

function EndpointRipples({ notes, positions, arrivals }: {
  notes: GraphNote[]
  positions: Map<string, [number, number, number]>
  arrivals: Map<string, number>
}) {
  const rippleMesh = useRef<THREE.InstancedMesh>(null)
  const transform = useMemo(() => new THREE.Object3D(), [])
  const rippleColor = useMemo(() => new THREE.Color('#d7f8ff'), [])
  const geometry = useMemo(() => new THREE.TorusGeometry(1, 0.012, 4, 40), [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), [])
  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])
  useFrame((state) => {
    const mesh = rippleMesh.current
    if (!mesh) return
    const now = state.clock.elapsedTime
    notes.forEach((note, index) => {
      const position = positions.get(note.id)
      const until = arrivals.get(note.id) ?? 0
      const remaining = THREE.MathUtils.clamp((until - now) / 0.34, 0, 1)
      if (!position || remaining <= 0) {
        transform.scale.setScalar(0)
        rippleColor.set('#000000')
      } else {
        const progress = 1 - remaining
        const seed = hashText(note.id)
        const sizeVariation = 0.9 + (seed % 201) / 1000
        const radius = nodeRadius(note.importance) * sizeVariation
        transform.position.set(...position)
        transform.rotation.set(Math.PI / 2 + progress * 0.35, progress * 0.2, 0)
        transform.scale.setScalar(radius * (0.55 + progress * 1.15))
        rippleColor.set('#d7f8ff').multiplyScalar(remaining * remaining * 1.4)
      }
      transform.updateMatrix()
      mesh.setMatrixAt(index, transform.matrix)
      mesh.setColorAt(index, rippleColor)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={rippleMesh} args={[geometry, material, notes.length]} frustumCulled={false} raycast={() => null} />
}

function Scene({ notes, edges, positions, selectedId, connectionExplorationId, cameraResetKey, cameraCenterKey, cameraCenter, cameraRadius, initialCameraPosition, zoomCommand, onCameraChange, hoveredId, highlightIds, pathIds, traversalIds, pathPulseKey, visualEvent, onVisualEventComplete, onSelect, onHover, frameDistance }: GalaxyCanvasProps & { frameDistance: number; positions: Map<string, [number, number, number]>; cameraCenter: [number, number, number]; cameraRadius: number; initialCameraPosition: [number, number, number] }) {
  const arrivalUntil = useMemo(() => new Map<string, number>(), [])
  const neighbors = useMemo(() => createNeighborMap(notes, edges), [notes, edges])
  const focus = selectedId ? positions.get(selectedId) ?? null : null
  const focusId = connectionExplorationId ?? selectedId ?? hoveredId
  const beamFocusId = connectionExplorationId ?? selectedId
  const pathSet = useMemo(() => pathIds ? new Set(pathIds) : null, [pathIds])
  const explorationSet = useMemo(() => connectionExplorationId
    ? new Set([connectionExplorationId, ...(neighbors.get(connectionExplorationId) ?? [])])
    : null, [connectionExplorationId, neighbors])
  const filterSet = useMemo(() => explorationSet ?? pathSet ?? (highlightIds ? new Set(highlightIds) : null), [explorationSet, pathSet, highlightIds])
  const emphasized = useMemo(() => {
    if (!focusId) return null
    return new Set([focusId, ...(neighbors.get(focusId) ?? [])])
  }, [focusId, neighbors])
  const pathEdgeKeys = useMemo(() => {
    if (!pathIds || pathIds.length < 2) return new Set<string>()
    return new Set(pathIds.slice(0, -1).map((id, index) => [id, pathIds[index + 1]].sort().join('\u0000')))
  }, [pathIds])
  const traversalEdgeIds = useMemo(() => traversalIds ? deriveTraversalEdgeIds(traversalIds, edges) : [], [traversalIds, edges])
  const visibleEdges = useMemo(() => edges.flatMap((edge) => {
    const source = positions.get(edge.sourceNoteId)
    const target = positions.get(edge.targetNoteId)
    if (!source || !target) return []
    const pathEdge = Boolean(pathSet && pathEdgeKeys.has([edge.sourceNoteId, edge.targetNoteId].sort().join('\u0000')))
    const joinsGroup = Boolean(!pathSet && highlightIds?.includes(edge.sourceNoteId) && highlightIds.includes(edge.targetNoteId))
    const focusEdge = Boolean(focusId && (edge.sourceNoteId === focusId || edge.targetNoteId === focusId))
    const activeBeam = Boolean(beamFocusId && !pathEdge && (edge.sourceNoteId === beamFocusId || edge.targetNoteId === beamFocusId))
    return [{ edge, source, target, pathEdge, activeBeam, focusEdge, joinsGroup }]
  }), [edges, positions, pathSet, pathEdgeKeys, highlightIds, focusId, beamFocusId])
  const beamConnections = useMemo(() => edges.flatMap((edge) => {
    const source = positions.get(edge.sourceNoteId)
    const target = positions.get(edge.targetNoteId)
    return source && target ? [{ edge, source, target, pathEdge: false, activeBeam: false, focusEdge: false, joinsGroup: false }] : []
  }), [edges, positions])
  const hasActiveBfsPath = pathEdgeKeys.size > 0
  const beamEmphasis = useMemo(() => new Map(visibleEdges.map((connection) => [connection.edge.id, {
    selected: !hasActiveBfsPath && traversalEdgeIds.length === 0 && connection.activeBeam ? 1 : 0,
    bfs: connection.pathEdge ? 1 : 0,
    traversal: 0,
    hover: !connectionExplorationId && !hasActiveBfsPath && traversalEdgeIds.length === 0 && hoveredId && (connection.edge.sourceNoteId === hoveredId || connection.edge.targetNoteId === hoveredId) ? 1 : 0,
  }])), [visibleEdges, hasActiveBfsPath, traversalEdgeIds, hoveredId, connectionExplorationId])
  const traversalEdgeSet = useMemo(() => new Set(traversalEdgeIds), [traversalEdgeIds])
  const activeBeamConnections = useMemo(() => beamConnections.filter((connection) => {
    const state = beamEmphasis.get(connection.edge.id)
    return traversalEdgeSet.has(connection.edge.id) || Boolean(state && (state.selected > 0 || state.bfs > 0 || state.hover > 0))
  }), [beamConnections, beamEmphasis, traversalEdgeSet])
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
    <Environment resolution={64} frames={1}>
      <Lightformer form="rect" intensity={1.65} color="#ffffff" scale={[4, 2, 1]} position={[0, 5, 6]} />
      <Lightformer form="rect" intensity={1.1} color="#b9dce4" scale={[3, 1, 1]} position={[-5, 1, -3]} rotation={[0, Math.PI / 2, 0]} />
      <Lightformer form="rect" intensity={0.9} color="#d9e5e6" scale={[2, 3, 1]} position={[4, -2, 2]} rotation={[0, -0.8, 0.3]} />
    </Environment>
    <CosmicDust />
    <StarField />
    <DeepField />
    <DistantGalaxyField />
    <group>
      <PlasmaNetwork connections={beamConnections} emphasisByEdge={beamEmphasis} traversalEdgeIds={traversalEdgeIds} explorationActive={Boolean(connectionExplorationId)} />
      <EnergyFlows connections={activeBeamConnections} emphasisByEdge={beamEmphasis} traversalEdgeIds={traversalEdgeIds} arrivals={arrivalUntil} />
      <EndpointRipples notes={notes} positions={positions} arrivals={arrivalUntil} />
      {pathPoints.length > 0 && <PathPulse key={pathPulseKey} ids={pathIds ?? []} positions={positions} pulseKey={pathPulseKey} />}
    </group>
    <NodeGalaxyParticles notes={notes} positions={positions} selectedId={selectedId} hoveredId={hoveredId} emphasisIds={filterSet ?? emphasized} explorationActive={Boolean(connectionExplorationId)} />
    <StarNodeField notes={notes} edges={edges} positions={positions} selectedId={selectedId} hoveredId={hoveredId} emphasisIds={filterSet ?? emphasized} pathIds={pathIds} explorationActive={Boolean(connectionExplorationId)} />
    {notes.map((note) => {
      const position = positions.get(note.id)
      if (!position) return null
      const focused = filterSet ?? emphasized
      const active = Boolean(focused?.has(note.id))
      return <NoteNode key={note.id} note={note} position={position} active={active} hovered={note.id === hoveredId} selected={note.id === selectedId} onPath={Boolean(pathSet?.has(note.id))} focusEmphasis={Boolean(connectionExplorationId && filterSet?.has(note.id))} onSelect={() => onSelect(note)} onHover={onHover} />
    })}
    {visualEvent && mutationPosition && mutationEdgeExists && (visualEvent.kind !== 'relationship' || mutationTarget) && <GraphMutationEffect
      key={visualEvent.key} event={visualEvent} position={mutationPosition} target={mutationTarget}
      onComplete={onVisualEventComplete} />}
    <CameraFocus focus={focus as [number, number, number] | null} explorationActive={Boolean(connectionExplorationId)} resetKey={cameraResetKey} centerKey={cameraCenterKey} centerTarget={cameraCenter} centerRadius={cameraRadius} initialCameraPosition={initialCameraPosition} zoomCommand={zoomCommand} onCameraChange={onCameraChange} frameDistance={frameDistance} />
  </>
}

export const GalaxyCanvas = memo(function GalaxyCanvas(props: GalaxyCanvasProps) {
  const positions = useMemo(() => createGalaxyLayout(props.notes, props.edges), [props.notes, props.edges])
  const graphFrame = useMemo(() => {
    if (!positions.size) return { center: [0, 0, 0] as [number, number, number], radius: 1 }
    const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity }
    positions.forEach(([x, y, z]) => {
      bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x)
      bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y)
      bounds.minZ = Math.min(bounds.minZ, z); bounds.maxZ = Math.max(bounds.maxZ, z)
    })
    const center: [number, number, number] = [
      (bounds.minX + bounds.maxX) / 2,
      (bounds.minY + bounds.maxY) / 2,
      (bounds.minZ + bounds.maxZ) / 2,
    ]
    let radius = 0
    positions.forEach(([x, y, z]) => { radius = Math.max(radius, Math.hypot(x - center[0], y - center[1], z - center[2])) })
    return { center, radius: Math.max(1, radius) }
  }, [positions])
  const frameDistance = useMemo(() => {
    let radius = 0
    positions.forEach(([x, y, z]) => { radius = Math.max(radius, Math.hypot(x, y, z)) })
    return Math.max(18, radius * 1.78)
  }, [positions])
  const initialCameraPosition = useMemo<[number, number, number]>(() => [0, frameDistance * 0.22, frameDistance], [frameDistance])
  return <Canvas camera={{ position: initialCameraPosition, fov: 48 }} dpr={[1, 1.6]} gl={{ antialias: true, alpha: false }} onPointerMissed={() => { props.onHover(null); props.onBackgroundClick() }}>
    <Scene {...props} positions={positions} frameDistance={frameDistance} cameraCenter={graphFrame.center} cameraRadius={graphFrame.radius} initialCameraPosition={initialCameraPosition} />
  </Canvas>
})
