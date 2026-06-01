"use client"

import { useEffect } from "react"

/**
 * Reveal-on-scroll using the Intersection Observer API (no external libraries).
 *
 * Any element inside the mounted tree carrying a `data-animate` attribute
 * ("fade-up" | "fade-in" | "stagger") gets an `in-view` class added once when it
 * first scrolls into view. The actual transitions live in globals.css. Triggers
 * a single time per element (we unobserve after revealing) so content doesn't
 * re-animate when scrolling back up.
 */
export function useScrollAnimation() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-animate]"))
    if (els.length === 0) return

    // Fallback: if IntersectionObserver is unavailable, just reveal everything.
    if (typeof IntersectionObserver === "undefined") {
      els.forEach((el) => el.classList.add("in-view"))
      return
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view")
            obs.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    )

    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])
}
