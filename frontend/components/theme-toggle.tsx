"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"

/**
 * Light/dark toggle. The actual class is applied to <html> by the inline
 * no-flash script in layout.tsx before first paint; this button just flips it
 * and persists the choice. Mirrors the script's logic so the two never drift.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setDark(document.documentElement.classList.contains("dark"))
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle("dark", next)
    try {
      localStorage.setItem("theme", next ? "dark" : "light")
    } catch {
      /* storage blocked — toggle still works for the session */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={`inline-flex size-9 items-center justify-center rounded-full border border-line text-stone transition-colors hover:border-line-strong hover:text-gold ${className}`}
    >
      {/* Render a stable icon until mounted to avoid hydration mismatch. */}
      {mounted && dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}
