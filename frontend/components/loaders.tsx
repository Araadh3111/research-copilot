"use client"

import { useState, type ReactNode } from "react"

/**
 * Eight organic, indeterminate loaders — pure CSS/SVG, black shapes on a
 * transparent 200×200 canvas, infinite loops, no text. Animations live in
 * globals.css (`.ldr-*`). `<Box>` lets the same 200×200 art render at any size
 * by scaling, so the loaders work both in the landing picker grid and inline
 * in the synthesis card.
 */

function Box({ size = 200, children }: { size?: number; children: ReactNode }) {
  const s = size / 200
  return (
    <div style={{ width: size, height: size }} className="relative shrink-0">
      <div
        style={{ transform: `scale(${s})`, transformOrigin: "top left" }}
        className="absolute left-0 top-0 flex size-[200px] items-center justify-center"
      >
        {children}
      </div>
    </div>
  )
}

/** Shared SVG goo filter (used by the melting-dots loader). Render once/page. */
export function GooDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <filter id="ldr-goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
            result="goo"
          />
          <feBlend in="SourceGraphic" in2="goo" />
        </filter>
      </defs>
    </svg>
  )
}

const BreathingBlob = () => <div className="ldr-breathing-blob" />

const LiquidFill = () => (
  <div className="ldr-liquid">
    <div className="ldr-liquid-fill" />
  </div>
)

const OrbitingBlobs = () => (
  <div className="ldr-orbit">
    <span />
    <span />
  </div>
)

const PulsingRing = () => <div className="ldr-ring" />

const MeltingDots = () => (
  <div className="ldr-melt">
    <span />
    <span />
    <span />
  </div>
)

const Worm = () => (
  <svg viewBox="0 0 200 200" className="ldr-worm">
    <path d="M16 100 Q58 30 100 100 T184 100" />
  </svg>
)

const MagneticField = () => (
  <div className="ldr-magnet">
    <span />
    <span />
    <span />
    <span />
    <span />
  </div>
)

const BreathingEye = () => (
  <div className="ldr-eye">
    <span className="ldr-eye-pupil" />
  </div>
)

export const LOADERS: { name: string; Component: () => ReactNode }[] = [
  { name: "Breathing blob", Component: BreathingBlob },
  { name: "Liquid fill", Component: LiquidFill },
  { name: "Orbiting blobs", Component: OrbitingBlobs },
  { name: "Pulsing ring", Component: PulsingRing },
  { name: "Melting dots", Component: MeltingDots },
  { name: "Worm", Component: Worm },
  { name: "Magnetic field", Component: MagneticField },
  { name: "Breathing eye", Component: BreathingEye },
]

/** A single loader rendered at `size`, picked by index. */
export function Loader({ index, size = 200 }: { index: number; size?: number }) {
  const { Component } = LOADERS[index % LOADERS.length]
  return (
    <Box size={size}>
      <GooDefs />
      <Component />
    </Box>
  )
}

/** Picks one of the eight at random (once per mount) — used in the search card. */
export function RandomLoader({ size = 200 }: { size?: number }) {
  const [index] = useState(() => Math.floor(Math.random() * LOADERS.length))
  return <Loader index={index} size={size} />
}
