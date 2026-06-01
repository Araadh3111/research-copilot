"use client"

import { useRef, type ReactNode } from "react"

/**
 * Magnetic hover wrapper: the child drifts toward the cursor while hovered and
 * springs back on leave. Pure transform (GPU-cheap), disabled for users who
 * prefer reduced motion and on touch (no hover). Render as inline-block so it
 * hugs the child (e.g. a button).
 */
export function Magnetic({
  children,
  strength = 0.4,
  className = "",
}: {
  children: ReactNode
  strength?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement | null>(null)

  function onMove(e: React.MouseEvent<HTMLSpanElement>) {
    const el = ref.current
    if (!el) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - (rect.left + rect.width / 2)) * strength
    const y = (e.clientY - (rect.top + rect.height / 2)) * strength
    el.style.transform = `translate(${x}px, ${y}px)`
  }

  function reset() {
    const el = ref.current
    if (el) el.style.transform = "translate(0px, 0px)"
  }

  return (
    <span
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      className={`inline-block transition-transform duration-300 ease-out ${className}`}
      style={{ willChange: "transform" }}
    >
      {children}
    </span>
  )
}
