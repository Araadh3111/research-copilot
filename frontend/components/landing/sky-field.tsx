"use client"

/**
 * SkyField — the Observatory's living night sky.
 *
 * A fixed full-viewport three.js starfield rendered behind the landing's
 * scroll story. Three depth shells of stars (far/mid/near) rotate at slightly
 * different speeds for parallax; the camera glides deeper into the field as
 * the page scrolls (fed a MotionValue so scroll never re-renders React), and
 * eases toward the pointer for a quiet "you are steering the telescope" feel.
 *
 * Colours follow the Observatory palette: mostly starlight, a scatter of
 * brass-gold and signal-teal stars. Additive blending so dense regions glow.
 */

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { Canvas, useFrame } from "@react-three/fiber"
import type { MotionValue } from "motion/react"

const STARLIGHT = new THREE.Color("#EDF1F7")
const GOLD = new THREE.Color("#D4AF37")
const TEAL = new THREE.Color("#2DD4BF")
const BLUE = new THREE.Color("#9DBBFF")

function makeShell(count: number, rMin: number, rMax: number, size: number) {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // Uniform direction, radius biased outward so the shell feels deep.
    const u = Math.random()
    const v = Math.random()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v - 1)
    const r = rMin + (rMax - rMin) * Math.cbrt(Math.random())
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.7 // squash vertically — a sky, not a ball
    positions[i * 3 + 2] = r * Math.cos(phi)

    const roll = Math.random()
    const c =
      roll < 0.82 ? STARLIGHT : roll < 0.9 ? BLUE : roll < 0.96 ? GOLD : TEAL
    // Vary brightness so the field shimmers rather than reading flat.
    const dim = 0.45 + Math.random() * 0.55
    colors[i * 3] = c.r * dim
    colors[i * 3 + 1] = c.g * dim
    colors[i * 3 + 2] = c.b * dim
  }
  return { positions, colors, size }
}

function StarShell({
  shell,
  speed,
}: {
  shell: { positions: Float32Array; colors: Float32Array; size: number }
  speed: number
}) {
  const ref = useRef<THREE.Points>(null)
  useFrame((_, delta) => {
    if (!ref.current) return
    ref.current.rotation.y += delta * speed
    ref.current.rotation.x += delta * speed * 0.18
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
        opacity={0.95}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

function Rig({ scrollProgress }: { scrollProgress: MotionValue<number> }) {
  const pointer = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener("pointermove", onMove, { passive: true })
    return () => window.removeEventListener("pointermove", onMove)
  }, [])

  useFrame(({ camera }, delta) => {
    const p = scrollProgress.get() // 0 → 1 across the whole story
    // Glide deeper into the field over the story, then settle.
    const targetZ = 52 - p * 30
    const targetX = pointer.current.x * 2.2
    const targetY = -pointer.current.y * 1.6
    const k = Math.min(1, delta * 2.4) // frame-rate independent ease
    camera.position.z += (targetZ - camera.position.z) * k
    camera.position.x += (targetX - camera.position.x) * k
    camera.position.y += (targetY - camera.position.y) * k
    camera.lookAt(0, 0, 0)
  })
  return null
}

export function SkyField({ scrollProgress }: { scrollProgress: MotionValue<number> }) {
  // Three shells: a distant dense dust, a mid field, and a near sparse layer
  // that streams past the camera during the scroll fly-through.
  const far = useMemo(() => makeShell(2600, 60, 120, 0.5), [])
  const mid = useMemo(() => makeShell(1400, 34, 60, 0.85), [])
  const near = useMemo(() => makeShell(420, 16, 34, 1.35), [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: false, powerPreference: "high-performance", alpha: true }}
        camera={{ position: [0, 0, 52], fov: 58, near: 0.1, far: 300 }}
      >
        <StarShell shell={far} speed={0.004} />
        <StarShell shell={mid} speed={0.0075} />
        <StarShell shell={near} speed={0.012} />
        <Rig scrollProgress={scrollProgress} />
      </Canvas>
    </div>
  )
}
