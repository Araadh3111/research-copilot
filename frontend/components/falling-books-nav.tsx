"use client"

import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { BookOpen, Menu, X } from "lucide-react"
import { Logo } from "@/components/logo"

// Secondary nav destinations, shared by the desktop row and the mobile menu so
// the two never drift. The "Sign in" CTA is rendered separately (always visible).
const NAV_LINKS = [
  { href: "/classic", label: "How it works" },
  { href: "/desk", label: "The Desk" },
  { href: "/galaxy", label: "Explore" },
] as const

/**
 * FallingBooksNav — a sticky top navigation bar with a continuous "books
 * falling" motif drifting behind the brand/links. Little open-book glyphs tumble
 * down across the bar, rotating and fading, like pages raining onto a desk.
 *
 * The falling layer is purely decorative (pointer-events: none, aria-hidden) and
 * is mount-gated so the server renders none — that keeps SSR/CSR markup
 * identical (no hydration mismatch) and lets us honour prefers-reduced-motion,
 * where the books simply don't animate. The bar itself (logo + links) always
 * renders so navigation works even before hydration.
 */

// Deterministic book seeds (no Math.random at render → SSR-safe). Each book gets
// a horizontal position, size, fall duration, start delay, spin and tint so the
// shower feels organic rather than a uniform grid.
const BOOKS = [
  { left: 4, size: 16, dur: 6.0, delay: 0.0, rot: -28, gold: true },
  { left: 12, size: 22, dur: 7.6, delay: 1.4, rot: 18, gold: false },
  { left: 19, size: 14, dur: 5.4, delay: 3.1, rot: -12, gold: true },
  { left: 27, size: 19, dur: 8.2, delay: 0.7, rot: 30, gold: false },
  { left: 34, size: 13, dur: 6.8, delay: 2.5, rot: -22, gold: true },
  { left: 42, size: 24, dur: 9.0, delay: 4.0, rot: 14, gold: false },
  { left: 49, size: 15, dur: 5.8, delay: 1.0, rot: -34, gold: true },
  { left: 57, size: 20, dur: 7.2, delay: 3.6, rot: 24, gold: false },
  { left: 64, size: 13, dur: 6.4, delay: 0.4, rot: -16, gold: true },
  { left: 71, size: 23, dur: 8.6, delay: 2.0, rot: 20, gold: false },
  { left: 78, size: 16, dur: 6.2, delay: 4.4, rot: -26, gold: true },
  { left: 85, size: 18, dur: 7.8, delay: 1.7, rot: 12, gold: false },
  { left: 92, size: 14, dur: 5.6, delay: 3.3, rot: -20, gold: true },
  { left: 97, size: 21, dur: 8.0, delay: 0.9, rot: 28, gold: false },
] as const

export function FallingBooksNav() {
  // Mount-gate only — NOT prefers-reduced-motion. Windows defaults reduced-motion
  // ON, so gating the books on it would hide them for most visitors. The shower
  // is gentle and decorative, so we run it for everyone once mounted (which also
  // keeps SSR/CSR markup identical, avoiding a hydration mismatch).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const animate = mounted

  // Mobile-only dropdown: without it the secondary links (hidden on < sm) are
  // unreachable on a phone, so landing routes like /desk look "missing".
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-canvas/70 backdrop-blur-md">
      {/* Falling-books layer — decorative, clipped to the bar, behind content. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {animate &&
          BOOKS.map((b, i) => (
            <motion.span
              key={i}
              className="absolute top-0"
              style={{ left: `${b.left}%` }}
              initial={{ y: -30, opacity: 0, rotate: b.rot }}
              animate={{ y: 88, opacity: [0, 1, 1, 0], rotate: b.rot + 46 }}
              transition={{
                duration: b.dur,
                delay: b.delay,
                repeat: Infinity,
                ease: "easeIn",
                times: [0, 0.18, 0.72, 1],
              }}
            >
              <BookOpen
                size={b.size}
                strokeWidth={1.75}
                className={b.gold ? "text-gold" : "text-ink/55"}
              />
            </motion.span>
          ))}
      </div>

      {/* Bar content */}
      <nav className="relative z-10 mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="flex items-center gap-2.5">
          <Logo size={30} />
          <span className="font-serif text-lg font-semibold tracking-tight text-ink">
            Researca
          </span>
        </a>

        <div className="flex items-center gap-4 sm:gap-6">
          {/* Desktop link row */}
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="hidden text-sm text-stone transition-colors hover:text-ink sm:block"
            >
              {l.label}
            </a>
          ))}
          <a
            href="/auth"
            className="whitespace-nowrap rounded-full bg-ink px-5 py-2 text-sm font-medium text-cream transition-colors hover:bg-ink-soft"
          >
            Sign in
          </a>
          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="inline-flex size-9 items-center justify-center rounded-full border border-line text-stone transition-colors hover:border-line-strong hover:text-ink sm:hidden"
          >
            {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </nav>

      {/* Mobile dropdown — stacks the secondary links below the bar. */}
      {menuOpen && (
        <div className="relative z-10 border-t border-line/70 bg-canvas/95 backdrop-blur-md sm:hidden">
          <div className="mx-auto flex max-w-6xl flex-col px-6 py-2">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="py-2.5 text-sm text-stone transition-colors hover:text-ink"
              >
                {l.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}
