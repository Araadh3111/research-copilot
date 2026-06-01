"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Animate a number from 0 → `end` once the element scrolls into view.
 * Returns the live value plus a ref to attach to the element to observe.
 * Respects prefers-reduced-motion (jumps straight to the final value).
 */
export function useCountUp(end: number, durationMs = 1400) {
  const [value, setValue] = useState(0)
  const ref = useRef<HTMLSpanElement | null>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

    const run = () => {
      if (started.current) return
      started.current = true
      if (reduce) {
        setValue(end)
        return
      }
      const start = performance.now()
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs)
        // easeOutExpo for a snappy, premium settle.
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
        setValue(Math.round(eased * end))
        if (t < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }

    if (typeof IntersectionObserver === "undefined") {
      run()
      return
    }
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && run()),
      { threshold: 0.4 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [end, durationMs])

  return { value, ref }
}
