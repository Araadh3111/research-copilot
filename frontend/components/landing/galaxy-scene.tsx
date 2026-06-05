"use client"

import { useLayoutEffect, useMemo, useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { EffectComposer, Bloom } from "@react-three/postprocessing"
import * as THREE from "three"

// ── Field constants ───────────────────────────────────────────────────────────
const STAR_COUNT = 150
// Stars fill a sphere of this radius around the origin. The camera (z = 9) sits
// *inside* that sphere, so the field wraps around the viewer — near stars sweep
// past while far ones barely move, which is what sells the depth on parallax.
const FIELD_RADIUS = 14
// Near-black with a faint blue cast. Mirrored as a CSS background in
// galaxy-landing.tsx so the void is already painted before WebGL boots.
const VOID_COLOR = "#04060d"

// A handful of stellar colours — warm gold through white to cool blue. Real stars
// vary by temperature; the gold end also nods to the brand palette. Colours are
// pushed into HDR (values > 1) per-star below so the brightest ones bloom hardest.
const STAR_PALETTE = ["#fff4e0", "#ffd9a0", "#ffc26b", "#ffffff", "#dfe9ff", "#a9c7ff"]

type Star = {
  position: [number, number, number]
  scale: number
  color: THREE.Color
}

function createStars(): Star[] {
  const stars: Star[] = []
  for (let i = 0; i < STAR_COUNT; i++) {
    // Uniform through the sphere's volume: cbrt of a uniform [0,1) stops stars
    // clumping at the centre; the spherical angles give an even angular spread.
    const radius = FIELD_RADIUS * Math.cbrt(Math.random())
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const sinPhi = Math.sin(phi)
    const position: [number, number, number] = [
      radius * sinPhi * Math.cos(theta),
      radius * sinPhi * Math.sin(theta) * 0.75, // gentle vertical squash → a hint of a galactic plane
      radius * Math.cos(phi),
    ]

    // Bias toward dimmer stars (squaring the random), with a few bright focal
    // points. Values > 1 are the HDR headroom the bloom pass feeds on.
    const brightness = 0.5 + Math.pow(Math.random(), 2) * 2.5
    const base = STAR_PALETTE[Math.floor(Math.random() * STAR_PALETTE.length)]
    const color = new THREE.Color(base).multiplyScalar(brightness)

    stars.push({ position, scale: 0.02 + Math.random() * 0.05, color })
  }
  return stars
}

// ── Star field: 150 emissive spheres in a single instanced draw call ──────────
function StarField() {
  const groupRef = useRef<THREE.Group>(null)
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const stars = useMemo(createStars, [])

  // Push each star's transform + colour into the instance buffers once. Runs
  // before paint, so the field never flashes in unpositioned.
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    for (let i = 0; i < stars.length; i++) {
      const star = stars[i]
      dummy.position.set(...star.position)
      dummy.scale.setScalar(star.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, star.color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [stars])

  // Very slow, continuous drift on two axes. delta-based, so the speed is
  // independent of frame rate; neither axis is fast enough to read as "spinning".
  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return
    group.rotation.y += delta * 0.02
    group.rotation.x += delta * 0.006
  })

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, STAR_COUNT]}>
        <sphereGeometry args={[1, 12, 12]} />
        {/* toneMapped={false} keeps the HDR star colours from being clamped
            before they reach the bloom pass. */}
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

// ── Mouse parallax: ease the camera a touch toward the cursor ─────────────────
function ParallaxRig() {
  useFrame((state, delta) => {
    const { camera, pointer } = state
    // pointer is normalised to [-1, 1]; keep the shift small so it's felt, not
    // seen. damp() glides the camera frame-rate-independently instead of snapping.
    camera.position.x = THREE.MathUtils.damp(camera.position.x, pointer.x * 0.8, 3, delta)
    camera.position.y = THREE.MathUtils.damp(camera.position.y, pointer.y * 0.8, 3, delta)
    camera.lookAt(0, 0, 0)
  })
  return null
}

export default function GalaxyScene() {
  return (
    <Canvas
      className="h-full w-full"
      camera={{ position: [0, 0, 9], fov: 60, near: 0.1, far: 100 }}
      dpr={[1, 2]}
      // The EffectComposer renders to its own multisampled HDR target, so default
      // canvas antialiasing would only be redundant work.
      gl={{ antialias: false }}
    >
      <color attach="background" args={[VOID_COLOR]} />
      {/* Exponential fog in the void colour dissolves distant stars into the
          background — depth, and it stops the far side reading as a wall. */}
      <fogExp2 attach="fog" args={[VOID_COLOR, 0.05]} />

      <StarField />
      <ParallaxRig />

      <EffectComposer>
        <Bloom
          mipmapBlur
          intensity={1.4}
          luminanceThreshold={0.18}
          luminanceSmoothing={0.22}
          radius={0.85}
          levels={8}
        />
      </EffectComposer>
    </Canvas>
  )
}
