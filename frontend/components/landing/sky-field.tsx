"use client"

/**
 * SkyField — a faint starfield TEXTURE behind the editorial layout.
 *
 * Deliberately restrained (the layout is the feature, not this): two dim
 * monochrome shells of stars on a fixed full-viewport canvas, drifting very
 * slowly, with a slight scroll-driven dolly. No colour, no additive bloom, no
 * pointer steering — just a quiet sense of depth so the ink-black ground isn't
 * dead flat. Kept low-opacity so type and hard rules always dominate.
 */

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { Canvas, useFrame } from "@react-three/fiber"
import type { MotionValue } from "motion/react"

function makeShell(count: number, rMin: number, rMax: number, size: number) {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const u = Math.random()
    const v = Math.random()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v - 1)
    const r = rMin + (rMax - rMin) * Math.cbrt(Math.random())
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.7
    positions[i * 3 + 2] = r * Math.cos(phi)
    // Monochrome starlight, dim and varied so it reads as faint dust.
    const g = 0.5 + Math.random() * 0.5
    colors[i * 3] = 0.93 * g
    colors[i * 3 + 1] = 0.95 * g
    colors[i * 3 + 2] = 0.97 * g
  }
  return { positions, colors, size }
}

function StarShell({
  shell,
  speed,
  opacity,
}: {
  shell: { positions: Float32Array; colors: Float32Array; size: number }
  speed: number
  opacity: number
}) {
  const ref = useRef<THREE.Points>(null)
  useFrame((_, delta) => {
    if (!ref.current) return
    ref.current.rotation.y += delta * speed
  })
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[shell.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[shell.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={shell.size}
        vertexColors
        sizeAttenuation
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </points>
  )
}

function Rig({ scrollProgress }: { scrollProgress: MotionValue<number> }) {
  useFrame(({ camera }, delta) => {
    const p = scrollProgress.get()
    const targetZ = 56 - p * 14 // a slight, slow dolly — not a fly-through
    const k = Math.min(1, delta * 1.6)
    camera.position.z += (targetZ - camera.position.z) * k
    camera.lookAt(0, 0, 0)
  })
  return null
}

export function SkyField({ scrollProgress }: { scrollProgress: MotionValue<number> }) {
  const far = useMemo(() => makeShell(1100, 60, 120, 0.42), [])
  const mid = useMemo(() => makeShell(550, 34, 60, 0.6), [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0" style={{ opacity: 0.55 }}>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: "high-performance", alpha: true }}
        camera={{ position: [0, 0, 56], fov: 58, near: 0.1, far: 300 }}
      >
        <StarShell shell={far} speed={0.0025} opacity={0.6} />
        <StarShell shell={mid} speed={0.004} opacity={0.8} />
        <Rig scrollProgress={scrollProgress} />
      </Canvas>
    </div>
  )
}
