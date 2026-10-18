import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react'
import './LandingPage.css'

type GalaxyKind = 'spiral' | 'elliptical' | 'edge-on' | 'irregular'
type PointerPosition = { x: number; y: number }

function revealProgress(time: number, start: number, end: number) {
  const progress = THREE.MathUtils.clamp((time - start) / (end - start), 0, 1)
  return progress * progress * (3 - 2 * progress)
}

function createRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 4294967296
  }
}

function createStarGeometry(count: number, radius: number, spread: number, seed: number) {
  const random = createRandom(seed)
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const palette = ['#f0f5fb', '#d8e2ed', '#c3d6e8', '#b8cee2'].map((color) => new THREE.Color(color))
  for (let index = 0; index < count; index += 1) {
    const vertical = random() * 2 - 1
    const angle = random() * Math.PI * 2
    const planar = Math.sqrt(1 - vertical * vertical)
    const distance = radius + random() * spread
    positions.set([
      planar * Math.cos(angle) * distance,
      vertical * distance,
      planar * Math.sin(angle) * distance,
    ], index * 3)
    const tint = palette[Math.floor(random() * palette.length)].clone().multiplyScalar(0.55 + random() * 0.75)
    colors.set([tint.r, tint.g, tint.b], index * 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

function createHighlightStarGeometry(count: number, radius: number, spread: number, seed: number) {
  const random = createRandom(seed)
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const phases = new Float32Array(count)
  const glints = new Float32Array(count)
  const palette = ['#f4f8ff', '#dce9f7', '#c7def3', '#eaf1fa'].map((color) => new THREE.Color(color))

  for (let index = 0; index < count; index += 1) {
    const vertical = random() * 2 - 1
    const angle = random() * Math.PI * 2
    const planar = Math.sqrt(1 - vertical * vertical)
    const distance = radius + random() * spread
    positions.set([
      planar * Math.cos(angle) * distance,
      vertical * distance,
      planar * Math.sin(angle) * distance,
    ], index * 3)
    const color = palette[Math.floor(random() * palette.length)]
    colors.set([color.r, color.g, color.b], index * 3)
    sizes[index] = 0.85 + random() * 1.45
    phases[index] = random() * Math.PI * 2
    glints[index] = random() < 0.14 ? 1 : 0
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  geometry.setAttribute('aGlint', new THREE.BufferAttribute(glints, 1))
  return geometry
}

function createCosmicDustGeometry(aspect: number) {
  const counts = { tiny: 420, medium: 112, motes: 32, wisps: 16 }
  const count = counts.tiny + counts.medium + counts.motes + counts.wisps
  const random = createRandom(0xd057)
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const opacities = new Float32Array(count)
  const phases = new Float32Array(count)
  const speeds = new Float32Array(count)
  const wander = new Float32Array(count)
  const stretches = new Float32Array(count)
  const angles = new Float32Array(count)
  const twinkles = new Float32Array(count)
  const palette = ['#aabdd0', '#c0cedb', '#d8e3ec', '#92abc2'].map((color) => new THREE.Color(color))
  const halfFovTangent = Math.tan(THREE.MathUtils.degToRad(25))

  for (let index = 0; index < count; index += 1) {
    const isTiny = index < counts.tiny
    const isMedium = index < counts.tiny + counts.medium
    const isMote = index < counts.tiny + counts.medium + counts.motes
    const isWisp = !isTiny && !isMedium && !isMote
    const screenX = random() * 2.24 - 1.12
    const screenY = random() * 2.24 - 1.12
    const cameraDepth = 27 + random() * 55
    const pointColor = palette[Math.floor(random() * palette.length)]
    const inHeroArea = Math.abs(screenX) < 0.39 && Math.abs(screenY) < 0.4

    positions.set([
      screenX * cameraDepth * halfFovTangent * aspect,
      screenY * cameraDepth * halfFovTangent,
      20.5 - cameraDepth,
    ], index * 3)
    colors.set([pointColor.r, pointColor.g, pointColor.b], index * 3)
    sizes[index] = isTiny ? 0.075 + random() * 0.11
      : isMedium ? 0.19 + random() * 0.22
        : isMote ? 0.48 + random() * 0.44
          : 1.15 + random() * 0.9
    const baseOpacity = isTiny ? 0.17 + random() * 0.2
      : isMedium ? 0.24 + random() * 0.23
        : isMote ? 0.22 + random() * 0.2
          : 0.09 + random() * 0.09
    opacities[index] = baseOpacity * (inHeroArea ? (isMote || isWisp ? 0.28 : 0.52) : 1)
    phases[index] = random() * Math.PI * 2
    speeds[index] = 0.45 + random() * 0.85
    wander[index] = 0.12 + random() * (isMote || isWisp ? 0.42 : 0.25)
    stretches[index] = isWisp ? 2.2 + random() * 1.1 : isMote ? 1.05 + random() * 0.35 : 1
    angles[index] = random() * Math.PI * 2
    twinkles[index] = random() < (isTiny ? 0.035 : 0.12) ? 1 : 0
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1))
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))
  geometry.setAttribute('aWander', new THREE.BufferAttribute(wander, 1))
  geometry.setAttribute('aStretch', new THREE.BufferAttribute(stretches, 1))
  geometry.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1))
  geometry.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkles, 1))
  return geometry
}

function createGalaxyTexture(kind: GalaxyKind, seed: number, tint: [number, number, number]) {
  const canvas = document.createElement('canvas')
  canvas.width = 192
  canvas.height = 192
  const context = canvas.getContext('2d')
  if (!context) return new THREE.CanvasTexture(canvas)
  const random = createRandom(seed)
  const color = `rgb(${tint[0]}, ${tint[1]}, ${tint[2]})`
  const cx = 96
  const cy = 96
  context.translate(cx, cy)
  context.rotate(random() * Math.PI * 2)

  if (kind === 'irregular') {
    const count = 7 + Math.floor(random() * 5)
    for (let index = 0; index < count; index += 1) {
      const x = (random() - 0.5) * 88
      const y = (random() - 0.5) * 68
      const radius = 20 + random() * 28
      const cloud = context.createRadialGradient(x, y, 1, x, y, radius)
      cloud.addColorStop(0, `${color.replace('rgb(', 'rgba(').replace(')', ', 0.24)')}`)
      cloud.addColorStop(0.48, `${color.replace('rgb(', 'rgba(').replace(')', ', 0.095)')}`)
      cloud.addColorStop(1, `${color.replace('rgb(', 'rgba(').replace(')', ', 0)')}`)
      context.fillStyle = cloud
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
    }
  } else {
    const aspect = kind === 'edge-on' ? 0.16 : kind === 'elliptical' ? 0.72 : 0.66
    context.save()
    context.scale(1, aspect)
    const halo = context.createRadialGradient(0, 0, 2, 0, 0, 83)
    halo.addColorStop(0, `${color.replace('rgb(', 'rgba(').replace(')', ', 0.42)')}`)
    halo.addColorStop(0.11, `${color.replace('rgb(', 'rgba(').replace(')', ', 0.28)')}`)
    halo.addColorStop(0.36, `${color.replace('rgb(', 'rgba(').replace(')', ', 0.12)')}`)
    halo.addColorStop(0.76, `${color.replace('rgb(', 'rgba(').replace(')', ', 0.035)')}`)
    halo.addColorStop(1, `${color.replace('rgb(', 'rgba(').replace(')', ', 0)')}`)
    context.fillStyle = halo
    context.beginPath()
    context.ellipse(0, 0, 83, 75, 0, 0, Math.PI * 2)
    context.fill()

    if (kind === 'spiral') {
      context.lineCap = 'round'
      context.lineWidth = 2 + random() * 2
      context.strokeStyle = `${color.replace('rgb(', 'rgba(').replace(')', ', 0.38)')}`
      context.shadowColor = `${color.replace('rgb(', 'rgba(').replace(')', ', 0.5)')}`
      context.shadowBlur = 12
      const phase = random() * Math.PI * 2
      for (let arm = 0; arm < 2; arm += 1) {
        context.beginPath()
        for (let step = 0; step <= 220; step += 1) {
          const progress = step / 220
          const angle = progress * Math.PI * 4.2 + arm * Math.PI + phase
          const radius = 6 + progress * 67
          const x = Math.cos(angle) * radius
          const y = Math.sin(angle) * radius
          if (step === 0) context.moveTo(x, y)
          else context.lineTo(x, y)
        }
        context.stroke()
      }
    } else if (kind === 'edge-on') {
      context.fillStyle = `${color.replace('rgb(', 'rgba(').replace(')', ', 0.17)')}`
      context.fillRect(-79, -1, 158, 2)
    }
    context.restore()
  }

  const core = context.createRadialGradient(-3, -4, 0, 0, 0, 28)
  core.addColorStop(0, 'rgba(245, 250, 255, 0.45)')
  core.addColorStop(0.22, `${color.replace('rgb(', 'rgba(').replace(')', ', 0.2)')}`)
  core.addColorStop(1, `${color.replace('rgb(', 'rgba(').replace(')', ', 0)')}`)
  context.fillStyle = core
  context.fillRect(-34, -34, 68, 68)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  return texture
}

const galaxySpecs: Array<{
  kind: GalaxyKind
  seed: number
  tint: [number, number, number]
  position: [number, number, number]
  screenPosition: [number, number]
  portraitPosition: [number, number]
  scale: [number, number]
  opacity: number
  rotation: number
}> = [
  { kind: 'spiral', seed: 12, tint: [191, 210, 231], position: [0, 0, -10], screenPosition: [0.64, 0.38], portraitPosition: [0.5, 0.42], scale: [8.2, 6.8], opacity: 0.58, rotation: 0.24 },
  { kind: 'elliptical', seed: 28, tint: [198, 208, 211], position: [0, 0, -17], screenPosition: [-0.57, 0.16], portraitPosition: [-0.48, 0.12], scale: [6.8, 5.2], opacity: 0.48, rotation: -0.42 },
  { kind: 'edge-on', seed: 45, tint: [200, 218, 237], position: [0, 0, -8], screenPosition: [-0.7, -0.64], portraitPosition: [-0.56, -0.62], scale: [7.4, 2.4], opacity: 0.54, rotation: 0.22 },
  { kind: 'spiral', seed: 59, tint: [190, 204, 210], position: [0, 0, -25], screenPosition: [0.62, -0.31], portraitPosition: [0.53, -0.32], scale: [5.6, 4.6], opacity: 0.5, rotation: -0.7 },
  { kind: 'irregular', seed: 76, tint: [187, 205, 229], position: [0, 0, -30], screenPosition: [-0.1, -0.08], portraitPosition: [-0.08, -0.06], scale: [5.2, 4.4], opacity: 0.4, rotation: 0.54 },
  { kind: 'elliptical', seed: 93, tint: [220, 229, 240], position: [0, 0, -42], screenPosition: [0.16, 0.74], portraitPosition: [0.18, 0.76], scale: [8.5, 6], opacity: 0.32, rotation: -0.12 },
  { kind: 'spiral', seed: 107, tint: [194, 211, 232], position: [0, 0, -48], screenPosition: [0.28, -0.74], portraitPosition: [0.2, -0.78], scale: [9.2, 7.5], opacity: 0.34, rotation: 0.82 },
  { kind: 'edge-on', seed: 121, tint: [192, 205, 212], position: [0, 0, -55], screenPosition: [0.78, 0.1], portraitPosition: [0.68, 0.16], scale: [7.8, 2.2], opacity: 0.35, rotation: -0.3 },
  { kind: 'irregular', seed: 138, tint: [197, 209, 229], position: [0, 0, -63], screenPosition: [-0.36, 0.58], portraitPosition: [-0.28, 0.57], scale: [6.8, 5.5], opacity: 0.28, rotation: 0.3 },
]

function Starfield({ pointer, reducedMotion }: {
  pointer: MutableRefObject<PointerPosition>
  reducedMotion: MutableRefObject<boolean>
}) {
  const distantStars = useMemo(() => createStarGeometry(1800, 72, 44, 0x1569), [])
  const midStars = useMemo(() => createStarGeometry(520, 45, 32, 0x922b), [])
  const nearStars = useMemo(() => createStarGeometry(75, 29, 16, 0x340d), [])
  const highlightStars = useMemo(() => createHighlightStarGeometry(42, 62, 34, 0xb417), [])
  const standoutStars = useMemo(() => createHighlightStarGeometry(36, 62, 34, 0x4c19), [])
  const shootingTrailGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const shootingHeadGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const highlightMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uReveal: { value: 0 }, uPixelRatio: { value: 1 } },
    vertexShader: `
      attribute float aSize;
      attribute float aPhase;
      attribute float aGlint;
      varying vec3 vColor;
      varying float vOpacity;
      varying float vGlint;
      uniform float uTime;
      uniform float uReveal;
      uniform float uPixelRatio;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float twinkle = 0.91 + 0.09 * sin(uTime * 0.82 + aPhase);
        vColor = color;
        vOpacity = uReveal * twinkle * (0.72 + 0.2 * aGlint);
        vGlint = aGlint;
        gl_PointSize = clamp(aSize * (260.0 / max(1.0, -viewPosition.z)) * uPixelRatio, 1.2 * uPixelRatio, 14.0 * uPixelRatio);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vOpacity;
      varying float vGlint;
      void main() {
        vec2 point = gl_PointCoord - vec2(0.5);
        float radius = length(point);
        float core = 1.0 - smoothstep(0.015, 0.15, radius);
        float halo = exp(-radius * 12.0) * 0.2;
        float horizontalGlint = exp(-abs(point.y) * 48.0) * exp(-abs(point.x) * 6.0);
        float verticalGlint = exp(-abs(point.x) * 48.0) * exp(-abs(point.y) * 6.0);
        float glint = max(horizontalGlint, verticalGlint) * vGlint * 0.13;
        float alpha = (core * 0.72 + halo + glint) * vOpacity;
        vec3 color = mix(vColor, vec3(1.0), core * 0.48 + glint * 0.65);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }), [])
  const shootingTrailMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 streakPosition = vec3(-uv.x, (uv.y - 0.5) * 2.0, 0.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(streakPosition, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uOpacity;
      void main() {
        float along = vUv.x;
        float across = abs((vUv.y - 0.5) * 2.0);
        float width = mix(0.72, 0.018, pow(along, 0.82));
        float normalizedAcross = across / width;
        float edge = 1.0 - smoothstep(0.72, 1.0, normalizedAcross);
        float aura = exp(-normalizedAcross * normalizedAcross * 2.1) * 0.22;
        float core = exp(-normalizedAcross * normalizedAcross * 30.0) * 0.95;
        float tailFade = pow(1.0 - along, 0.9) * (1.0 - smoothstep(0.84, 1.0, along));
        float alpha = (aura + core) * edge * tailFade * uOpacity;
        vec3 color = mix(vec3(0.38, 0.62, 0.84), vec3(0.92, 0.98, 1.0), (1.0 - along) * 0.8 + core * 0.2);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  }), [])
  const shootingHeadMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec2 vUv;
      uniform float uOpacity;
      void main() {
        float radius = length((vUv - vec2(0.5)) * 2.0);
        float core = 1.0 - smoothstep(0.04, 0.3, radius);
        float halo = exp(-radius * 6.0) * 0.22;
        float alpha = (core * 0.92 + halo * 0.28) * uOpacity;
        vec3 color = mix(vec3(0.53, 0.75, 0.94), vec3(1.0), core * 0.9);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }), [])
  const starLayers = useRef<Array<THREE.Group | null>>([])
  const starMaterials = useRef<Array<THREE.PointsMaterial | null>>([])
  const highlightMaterialRef = useRef<THREE.ShaderMaterial>(null)
  const shootingTrailMaterialRef = useRef<THREE.ShaderMaterial>(null)
  const shootingHeadMaterialRef = useRef<THREE.ShaderMaterial>(null)
  const shootingStarRef = useRef<THREE.Group>(null)
  const shootingTrailRef = useRef<THREE.Mesh>(null)
  const shootingHeadRef = useRef<THREE.Mesh>(null)
  const cameraTarget = useRef(new THREE.Vector3())
  const shootingForward = useRef(new THREE.Vector3())
  const shootingRight = useRef(new THREE.Vector3())
  const shootingUp = useRef(new THREE.Vector3())
  const shootingCenter = useRef(new THREE.Vector3())
  const shootingLastClock = useRef<number | null>(null)
  const shootingActiveTime = useRef(0)
  const pageVisible = useRef(!document.hidden)

  useEffect(() => {
    const updateVisibility = () => {
      pageVisible.current = !document.hidden
      shootingLastClock.current = null
    }
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  useEffect(() => () => {
    distantStars.dispose()
    midStars.dispose()
    nearStars.dispose()
    highlightStars.dispose()
    standoutStars.dispose()
    shootingTrailGeometry.dispose()
    shootingHeadGeometry.dispose()
    highlightMaterial.dispose()
    shootingTrailMaterial.dispose()
    shootingHeadMaterial.dispose()
  }, [distantStars, midStars, nearStars, highlightStars, standoutStars, shootingTrailGeometry, shootingHeadGeometry, highlightMaterial, shootingTrailMaterial, shootingHeadMaterial])

  useFrame(({ camera, clock, gl, size }, delta) => {
    const elapsed = reducedMotion.current ? 6 : clock.elapsedTime
    if (!reducedMotion.current) {
      cameraTarget.current.set(pointer.current.x * 0.72, pointer.current.y * 0.42, 20.5 - revealProgress(elapsed, 0.1, 3.4) * 2.5)
      camera.position.x = THREE.MathUtils.damp(camera.position.x, cameraTarget.current.x, 0.55, delta)
      camera.position.y = THREE.MathUtils.damp(camera.position.y, cameraTarget.current.y, 0.55, delta)
      camera.position.z = THREE.MathUtils.damp(camera.position.z, cameraTarget.current.z, 0.4, delta)
      camera.lookAt(0, 0, 0)
      starLayers.current.forEach((layer, index) => {
        if (!layer) return
        layer.rotation.y += (index + 1) * 0.000025 * delta * 60
        const travel = revealProgress(elapsed, 0.08 + index * 0.18, 2.25 + index * 0.18)
        layer.scale.setScalar(1.055 - travel * 0.055)
        if (starMaterials.current[index]) starMaterials.current[index]!.opacity = (0.58 + index * 0.06) * travel
      })
      if (highlightMaterialRef.current) {
        highlightMaterialRef.current.uniforms.uTime.value = clock.elapsedTime
        highlightMaterialRef.current.uniforms.uReveal.value = revealProgress(elapsed, 0.85, 2.9)
        highlightMaterialRef.current.uniforms.uPixelRatio.value = gl.getPixelRatio()
      }
      if (!pageVisible.current) {
        shootingLastClock.current = null
        if (shootingTrailMaterialRef.current) shootingTrailMaterialRef.current.uniforms.uOpacity.value = 0
        if (shootingHeadMaterialRef.current) shootingHeadMaterialRef.current.uniforms.uOpacity.value = 0
      } else {
        if (shootingLastClock.current !== null) {
          shootingActiveTime.current += Math.max(0, elapsed - shootingLastClock.current)
        }
        shootingLastClock.current = elapsed
        const firstPassStart = 2.18
        const passInterval = 6.5
        const passDuration = 0.92
        const sinceFirstPass = shootingActiveTime.current - firstPassStart
        const passAge = sinceFirstPass >= 0 ? sinceFirstPass % passInterval : -1
        const passProgress = passAge >= 0 ? THREE.MathUtils.clamp(passAge / passDuration, 0, 1) : 0
        const passActive = passAge >= 0 && passAge <= passDuration
        const easedProgress = passProgress * passProgress * (3 - 2 * passProgress)
        const passFade = passActive
          ? revealProgress(passProgress, 0, 0.055) * (1 - revealProgress(passProgress, 0.88, 1))
          : 0
        if (shootingTrailMaterialRef.current) shootingTrailMaterialRef.current.uniforms.uOpacity.value = passFade
        if (shootingHeadMaterialRef.current) shootingHeadMaterialRef.current.uniforms.uOpacity.value = passFade
        if (shootingStarRef.current && shootingTrailRef.current) {
          const distance = 10.5
          const halfHeight = Math.tan(THREE.MathUtils.degToRad(25)) * distance
          const halfWidth = halfHeight * (size.width / Math.max(size.height, 1))
          const startX = -1.14
          const endX = 1.14
          const startY = 0.62
          const endY = 0.26
          const screenX = startX + (endX - startX) * easedProgress
          const screenY = startY + (endY - startY) * easedProgress
          camera.getWorldDirection(shootingForward.current)
          shootingRight.current.set(1, 0, 0).applyQuaternion(camera.quaternion)
          shootingUp.current.set(0, 1, 0).applyQuaternion(camera.quaternion)
          shootingCenter.current.copy(camera.position).addScaledVector(shootingForward.current, distance)
          shootingStarRef.current.position.copy(shootingCenter.current)
            .addScaledVector(shootingRight.current, screenX * halfWidth)
            .addScaledVector(shootingUp.current, screenY * halfHeight)
          shootingStarRef.current.quaternion.copy(camera.quaternion)
          const angle = Math.atan2((endY - startY) * halfHeight, (endX - startX) * halfWidth)
          shootingTrailRef.current.rotation.z = angle
          const progressSpeed = Math.abs(endX - startX) * 6 * passProgress * (1 - passProgress) / passDuration
          const trailFraction = THREE.MathUtils.clamp(0.07 + progressSpeed * 0.045, 0.07, 0.3)
          shootingTrailRef.current.scale.set(trailFraction * halfWidth * 2, 0.021, 1)
        }
      }
    } else {
      shootingLastClock.current = null
      starMaterials.current.forEach((material, index) => { if (material) material.opacity = 0.58 + index * 0.06 })
      if (highlightMaterialRef.current) {
        highlightMaterialRef.current.uniforms.uTime.value = 0
        highlightMaterialRef.current.uniforms.uReveal.value = 1
        highlightMaterialRef.current.uniforms.uPixelRatio.value = gl.getPixelRatio()
      }
      if (shootingTrailMaterialRef.current) shootingTrailMaterialRef.current.uniforms.uOpacity.value = 0
      if (shootingHeadMaterialRef.current) shootingHeadMaterialRef.current.uniforms.uOpacity.value = 0
    }
  })

  return <>
    <group ref={(instance) => { starLayers.current[0] = instance }}>
      <points geometry={distantStars} frustumCulled={false} raycast={() => null}><pointsMaterial ref={(instance) => { starMaterials.current[0] = instance }} size={0.062} vertexColors transparent opacity={0} sizeAttenuation depthWrite={false} toneMapped={false} /></points>
    </group>
    <group ref={(instance) => { starLayers.current[1] = instance }}>
      <points geometry={midStars} frustumCulled={false} raycast={() => null}><pointsMaterial ref={(instance) => { starMaterials.current[1] = instance }} size={0.09} vertexColors transparent opacity={0} sizeAttenuation depthWrite={false} toneMapped={false} /></points>
    </group>
    <group ref={(instance) => { starLayers.current[2] = instance }}>
      <points geometry={nearStars} frustumCulled={false} raycast={() => null}><pointsMaterial ref={(instance) => { starMaterials.current[2] = instance }} size={0.14} vertexColors transparent opacity={0} sizeAttenuation depthWrite={false} toneMapped={false} /></points>
    </group>
    <points geometry={highlightStars} frustumCulled={false} raycast={() => null} renderOrder={1}>
      <primitive ref={highlightMaterialRef} object={highlightMaterial} attach="material" />
    </points>
    <points geometry={standoutStars} frustumCulled={false} raycast={() => null} renderOrder={1}>
      <primitive object={highlightMaterial} attach="material" />
    </points>
    <group ref={shootingStarRef} raycast={() => null}>
      <mesh ref={shootingTrailRef} geometry={shootingTrailGeometry} renderOrder={2} raycast={() => null}>
        <primitive ref={shootingTrailMaterialRef} object={shootingTrailMaterial} attach="material" />
      </mesh>
      <mesh ref={shootingHeadRef} geometry={shootingHeadGeometry} scale={[0.2, 0.2, 1]} position={[0, 0, 0.005]} renderOrder={3} raycast={() => null}>
        <primitive ref={shootingHeadMaterialRef} object={shootingHeadMaterial} attach="material" />
      </mesh>
    </group>
  </>
}

function Universe({ pointer, reducedMotion }: {
  pointer: MutableRefObject<PointerPosition>
  reducedMotion: MutableRefObject<boolean>
}) {
  const { size } = useThree()
  const cosmicDust = useMemo(() => createCosmicDustGeometry(size.width / Math.max(size.height, 1)), [size.width, size.height])
  const galaxyTextures = useMemo(() => galaxySpecs.map((galaxy) => createGalaxyTexture(galaxy.kind, galaxy.seed, galaxy.tint)), [])
  const galaxyPositions = useMemo(() => {
    const aspect = size.width / Math.max(size.height, 1)
    const portrait = aspect < 0.85
    const halfViewHeight = Math.tan(THREE.MathUtils.degToRad(25))
    return galaxySpecs.map((galaxy) => {
      const [horizontal, vertical] = portrait ? galaxy.portraitPosition : galaxy.screenPosition
      const distance = 20.5 - galaxy.position[2]
      const halfHeightAtDepth = halfViewHeight * distance
      return [horizontal * halfHeightAtDepth * aspect, vertical * halfHeightAtDepth, galaxy.position[2]] as [number, number, number]
    })
  }, [size.width, size.height])
  const dustLayer = useRef<THREE.Group>(null)
  const dustMaterial = useRef<THREE.ShaderMaterial>(null)
  const galaxyLayer = useRef<THREE.Group>(null)
  const galaxySprites = useRef<Array<THREE.Sprite | null>>([])
  const nebulaMaterial = useRef<THREE.ShaderMaterial>(null)
  const dustShader = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uPixelRatio: { value: 1 },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aOpacity;
      attribute float aPhase;
      attribute float aSpeed;
      attribute float aWander;
      attribute float aStretch;
      attribute float aAngle;
      attribute float aTwinkle;
      varying vec3 vColor;
      varying float vOpacity;
      varying float vStretch;
      varying float vAngle;
      uniform float uTime;
      uniform float uReveal;
      uniform float uPixelRatio;
      void main() {
        float time = uTime * (0.055 + aSpeed * 0.045);
        float amplitude = aWander * (0.55 + aSize * 0.18);
        vec3 driftingPosition = position;
        driftingPosition.x += sin(time + aPhase) * amplitude + sin(time * 0.43 + aPhase * 1.3) * amplitude * 0.28;
        driftingPosition.y += sin(time * 0.81 + aPhase + 2.0) * amplitude * 0.7 + cos(time * 0.37 + aPhase) * amplitude * 0.2;
        driftingPosition.z += cos(time * 0.69 + aPhase) * amplitude * 0.32;
        vec4 viewPosition = modelViewMatrix * vec4(driftingPosition, 1.0);
        float twinkle = 1.0 - aTwinkle * 0.045 + aTwinkle * 0.045 * sin(uTime * 0.38 + aPhase);
        vColor = color;
        vOpacity = aOpacity * uReveal * twinkle;
        vStretch = aStretch;
        vAngle = aAngle;
        gl_PointSize = clamp(aSize * aStretch * (230.0 / max(1.0, -viewPosition.z)) * uPixelRatio, 1.1 * uPixelRatio, 28.0 * uPixelRatio);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vOpacity;
      varying float vStretch;
      varying float vAngle;
      void main() {
        vec2 point = (gl_PointCoord - vec2(0.5)) * 2.0;
        float sine = sin(vAngle);
        float cosine = cos(vAngle);
        vec2 rotated = vec2(point.x * cosine - point.y * sine, point.x * sine + point.y * cosine);
        vec2 shape = vec2(rotated.x / vStretch, rotated.y * vStretch);
        float radiusSquared = dot(shape, shape);
        float diffuse = exp(-radiusSquared * 3.5);
        float grain = exp(-radiusSquared * 16.0);
        float alpha = (diffuse * 0.42 + grain * 0.12) * vOpacity;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    transparent: true,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }), [])
  const cameraTarget = useRef(new THREE.Vector3())
  const cameraForward = useRef(new THREE.Vector3())
  const atmosphere = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uGather: { value: 0 }, uReveal: { value: 0 }, uCameraForward: { value: new THREE.Vector3(0, 0, -1) } },
    vertexShader: 'varying vec3 vDirection; void main() { vDirection = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec3 vDirection;
      uniform float uTime;
      uniform float uGather;
      uniform float uReveal;
      uniform vec3 uCameraForward;
      float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 p) {
        vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y), mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) { float total = 0.0; float weight = 0.5; for (int i = 0; i < 4; i++) { total += noise(p) * weight; p *= 2.03; weight *= 0.5; } return total; }
      void main() {
        vec3 direction = normalize(vDirection);
        vec3 p = direction * 5.0 + vec3(uTime * 0.7, -uTime * 0.25, uTime * 0.4);
        float broad = smoothstep(0.38, 0.72, fbm(p * 0.56 + vec3(4.2, 1.3, 8.1)));
        float cloud = smoothstep(0.39, 0.7, fbm(p + vec3(5.2, 7.1, 2.3)));
        float detail = smoothstep(0.53, 0.76, fbm(p * 1.8 + vec3(9.0, 1.0, 3.0)));
        float clearCenter = smoothstep(0.08, 0.52, 1.0 - dot(direction, normalize(uCameraForward)));
        p += direction * sin(uTime * 0.8 + fbm(p * 0.3) * 5.0) * uGather * 0.035;
        float alpha = cloud * (0.38 + broad * 0.62) * clearCenter * (0.13 + detail * 0.11) * (1.0 + uGather * 0.7) * uReveal;
        float focalWave = exp(-pow((acos(clamp(dot(direction, normalize(uCameraForward)), -1.0, 1.0)) - (0.26 + uGather * 0.19)) * 19.0, 2.0)) * uGather;
        vec3 color = mix(vec3(0.026, 0.038, 0.062), vec3(0.061, 0.091, 0.142), broad);
        color = mix(color, vec3(0.055, 0.073, 0.083), smoothstep(0.54, 0.76, noise(p * 0.8 + vec3(8.0))) * 0.5);
        color += vec3(0.046, 0.083, 0.132) * focalWave;
        gl_FragColor = vec4(color, alpha + focalWave * 0.045);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }), [])

  useEffect(() => () => {
    cosmicDust.dispose()
    dustShader.dispose()
    galaxyTextures.forEach((texture) => texture.dispose())
    atmosphere.dispose()
  }, [cosmicDust, dustShader, galaxyTextures, atmosphere])

  useFrame((state, delta) => {
    const { camera, clock, gl } = state
    const elapsed = reducedMotion.current ? 6 : clock.elapsedTime
    if (!reducedMotion.current) {
      cameraTarget.current.set(pointer.current.x * 0.72, pointer.current.y * 0.42, 20.5 - revealProgress(elapsed, 0.1, 3.4) * 2.5)
      camera.position.x = THREE.MathUtils.damp(camera.position.x, cameraTarget.current.x, 0.55, delta)
      camera.position.y = THREE.MathUtils.damp(camera.position.y, cameraTarget.current.y, 0.55, delta)
      camera.position.z = THREE.MathUtils.damp(camera.position.z, cameraTarget.current.z, 0.4, delta)
      camera.lookAt(0, 0, 0)
      const pointerDrift = Math.sin(clock.elapsedTime * 0.12) * 0.000035
      if (galaxyLayer.current) galaxyLayer.current.rotation.y += pointerDrift * delta * 60
      if (dustLayer.current) {
        const travel = revealProgress(elapsed, 1.8, 3.7)
        dustLayer.current.scale.setScalar(1.055 - travel * 0.055)
        if (dustMaterial.current) {
          dustMaterial.current.uniforms.uTime.value = clock.elapsedTime
          dustMaterial.current.uniforms.uReveal.value = travel
          dustMaterial.current.uniforms.uPixelRatio.value = gl.getPixelRatio()
        }
      }
      galaxySprites.current.forEach((sprite, index) => {
        if (!sprite) return
        const visibility = revealProgress(elapsed, 0.2 + index * 0.13, 1.9 + index * 0.16)
        const spec = galaxySpecs[index]
        ;(sprite.material as THREE.SpriteMaterial).opacity = spec.opacity * visibility
        sprite.scale.set(spec.scale[0] * (0.94 + visibility * 0.06), spec.scale[1] * (0.94 + visibility * 0.06), 1)
      })
      const gather = revealProgress(elapsed, 1.85, 3.45) * (1 - revealProgress(elapsed, 3.35, 4.35))
      if (nebulaMaterial.current) nebulaMaterial.current.uniforms.uGather.value = gather
      if (nebulaMaterial.current) nebulaMaterial.current.uniforms.uReveal.value = revealProgress(elapsed, 1.55, 3.65)
    } else {
      if (dustMaterial.current) {
        dustMaterial.current.uniforms.uTime.value = 0
        dustMaterial.current.uniforms.uReveal.value = 1
        dustMaterial.current.uniforms.uPixelRatio.value = gl.getPixelRatio()
      }
      galaxySprites.current.forEach((sprite, index) => {
        if (sprite) (sprite.material as THREE.SpriteMaterial).opacity = galaxySpecs[index].opacity
      })
      if (nebulaMaterial.current) nebulaMaterial.current.uniforms.uGather.value = 0
      if (nebulaMaterial.current) nebulaMaterial.current.uniforms.uReveal.value = 1
    }
    camera.getWorldDirection(cameraForward.current)
    if (nebulaMaterial.current) {
      nebulaMaterial.current.uniforms.uCameraForward.value.copy(cameraForward.current)
      nebulaMaterial.current.uniforms.uTime.value = reducedMotion.current ? 0 : clock.elapsedTime * 0.012
    }
  })

  return <>
    <mesh renderOrder={-5} raycast={() => null}>
      <sphereGeometry args={[110, 48, 32]} />
      <primitive ref={nebulaMaterial} object={atmosphere} attach="material" />
    </mesh>

    <group ref={dustLayer}>
      <points geometry={cosmicDust} frustumCulled={false} raycast={() => null} renderOrder={-1}>
        <primitive ref={dustMaterial} object={dustShader} attach="material" />
      </points>
    </group>
    <group ref={galaxyLayer} raycast={() => null}>
      {galaxySpecs.map((galaxy, index) => <sprite
        key={galaxy.seed}
        ref={(instance) => { galaxySprites.current[index] = instance }}
        position={galaxyPositions[index]}
        rotation={[0, 0, galaxy.rotation]}
        scale={[galaxy.scale[0], galaxy.scale[1], 1]}
        raycast={() => null}
      >
        <spriteMaterial map={galaxyTextures[index]} color="#ffffff" transparent opacity={0} depthWrite={false} toneMapped={false} />
      </sprite>)}
    </group>
  </>
}

export function LandingPage({ onEnter }: { onEnter: () => void }) {
  const [entering, setEntering] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [environmentReady, setEnvironmentReady] = useState(false)
  const reducedMotionRef = useRef(reducedMotion)
  const pointer = useRef<PointerPosition>({ x: 0, y: 0 })
  const sceneReadyFrame = useRef<number | null>(null)
  const readyFallbackTimer = useRef<number | null>(null)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      setReducedMotion(preference.matches)
      reducedMotionRef.current = preference.matches
    }
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (environmentReady) return
    readyFallbackTimer.current = window.setTimeout(() => setEnvironmentReady(true), 1000)
    return () => {
      if (readyFallbackTimer.current !== null) window.clearTimeout(readyFallbackTimer.current)
      if (sceneReadyFrame.current !== null) window.cancelAnimationFrame(sceneReadyFrame.current)
    }
  }, [environmentReady])

  const markEnvironmentReady = () => {
    if (sceneReadyFrame.current !== null) window.cancelAnimationFrame(sceneReadyFrame.current)
    sceneReadyFrame.current = window.requestAnimationFrame(() => {
      if (readyFallbackTimer.current !== null) window.clearTimeout(readyFallbackTimer.current)
      readyFallbackTimer.current = null
      setEnvironmentReady(true)
      sceneReadyFrame.current = null
    })
  }

  useEffect(() => {
    if (!entering) return
    const timeout = window.setTimeout(onEnter, reducedMotion ? 40 : 480)
    return () => window.clearTimeout(timeout)
  }, [entering, onEnter, reducedMotion])

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    pointer.current.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
    pointer.current.y = 1 - ((event.clientY - bounds.top) / bounds.height) * 2
  }

  return <main className={`landing-page${entering ? ' landing-page--entering' : ''}${reducedMotion ? ' landing-page--reduced' : ''}${environmentReady ? ' landing-page--ready' : ''}`} onPointerMove={handlePointerMove}>
    <div className="landing-scene" aria-hidden="true">
      <Canvas camera={{ position: [0, 0, 20.5], fov: 50 }} dpr={[1, 1.5]} gl={{ alpha: false, antialias: false, powerPreference: 'low-power' }} onCreated={markEnvironmentReady} fallback={<div className="landing-webgl-fallback" />}>
        <color attach="background" args={['#020406']} />
        <Universe pointer={pointer} reducedMotion={reducedMotionRef} />
      </Canvas>
    </div>
    <div className="landing-stars" aria-hidden="true">
      <Canvas camera={{ position: [0, 0, 20.5], fov: 50 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: false, powerPreference: 'low-power' }} onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}>
        <Starfield pointer={pointer} reducedMotion={reducedMotionRef} />
      </Canvas>
    </div>
    <div className="landing-shade" aria-hidden="true" />

    <header className="landing-header">
      <a className="landing-brand" href="/" aria-label="Neural Nebula home">
        <span className="landing-mark" aria-hidden="true"><i /><i /><b /></span>
        <span><strong>NEURAL NEBULA</strong><small>AN UNIVERSE OF IDEAS</small></span>
      </a>
      <span className="landing-header-note">YOUR KNOWLEDGE, IN ORBIT</span>
    </header>

    <section className="landing-content" aria-labelledby="landing-title">
      <p className="landing-eyebrow"><span /> A SECOND BRAIN, REIMAGINED <span /></p>
      <h1 id="landing-title" aria-label="NEURAL NEBULA"><span aria-hidden="true">NEURAL NEBULA</span></h1>
      <button className="landing-enter" type="button" onClick={() => setEntering(true)} disabled={entering}>
        <span>ENTER THE NEBULA</span><b aria-hidden="true">→</b>
      </button>
      <p className="landing-tagline">Every idea is a universe waiting to be explored.</p>
      <p className="landing-description">Gather your thoughts. Follow the connections.<br />See what your knowledge becomes.</p>
    </section>

    <p className="landing-footnote"><span className="landing-signal" /> A LIVING GALAXY BUILT FROM YOUR IDEAS</p>
    <footer className="landing-footer"><span>EXPLORE THE SPACE BETWEEN IDEAS</span><span>EST. IN CURIOSITY</span></footer>
    <div className="landing-warp" aria-hidden="true" />
  </main>
}
