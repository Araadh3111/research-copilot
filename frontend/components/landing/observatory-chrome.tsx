"use client"

/**
 * Shared "Observatory" editorial chrome — the masthead, footer, rules, buttons,
 * ticker and page shell used by the landing AND every sub-page (/about,
 * /method, /journal) so they're one consistent publication. Bold-editorial /
 * brutalist: hard rules, mono metadata, sharp corners, Roboto display type.
 */

import { useEffect, useRef, type ReactNode } from "react"
import { motion, useInView } from "motion/react"
import { Logo } from "@/components/logo"
import { Magnetic } from "@/components/magnetic"

export const GOLD = "#D4AF37"
export const STAR = "#EDF1F7"
export const INK = "#0B0E14"
export const LINE = "rgba(237,241,247,0.14)"
export const LINE_STRONG = "rgba(237,241,247,0.30)"
export const EASE_OUT = [0.22, 1, 0.36, 1] as const

export const DISPLAY = "var(--font-display), sans-serif"
export const BODY = "var(--font-inter), system-ui, sans-serif"
export const MONO = "var(--font-pt-mono), monospace"

// ── Force night for the whole Observatory publication ─────────────────────────
export function useForceDark() {
  useEffect(() => {
    const root = document.documentElement
    const hadDark = root.classList.contains("dark")
    root.classList.add("dark")
    return () => {
      if (!hadDark) {
        try {
          if (localStorage.getItem("theme") === "light") root.classList.remove("dark")
        } catch {
          /* storage blocked */
        }
      }
    }
  }, [])
}

// ── Type helpers ──────────────────────────────────────────────────────────────
export function Mono({ children, className = "", style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`uppercase ${className}`} style={{ fontFamily: MONO, letterSpacing: "0.18em", ...style }}>
      {children}
    </span>
  )
}

export function Rule({ strong = false, className = "" }: { strong?: boolean; className?: string }) {
  return <div aria-hidden className={`w-full ${className}`} style={{ height: 1, backgroundColor: strong ? LINE_STRONG : LINE }} />
}

// A rule that draws in from the left when scrolled into view.
export function RuleDraw({ strong = false, className = "" }: { strong?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })
  return (
    <div ref={ref} aria-hidden className={`w-full overflow-hidden ${className}`} style={{ height: 1 }}>
      <motion.div
        initial={{ scaleX: 0 }}
        animate={inView ? { scaleX: 1 } : {}}
        transition={{ duration: 0.9, ease: EASE_OUT }}
        className="h-full w-full origin-left"
        style={{ backgroundColor: strong ? LINE_STRONG : LINE }}
      />
    </div>
  )
}

// ── Buttons — magnetic, sharp, bracketed mono ─────────────────────────────────
export function CoverButton({ label, href = "/auth", primary = true }: { label: string; href?: string; primary?: boolean }) {
  return (
    <Magnetic strength={0.25}>
      <a
        href={href}
        className="group relative inline-flex items-center gap-3 overflow-hidden px-7 py-3.5 text-[12px]"
        style={{
          backgroundColor: primary ? GOLD : "transparent",
          color: primary ? INK : STAR,
          border: `1px solid ${primary ? GOLD : LINE_STRONG}`,
          fontFamily: MONO,
          letterSpacing: "0.2em",
          fontWeight: 600,
        }}
      >
        {/* hover fill sweep (only for the outline variant) */}
        {!primary && (
          <span aria-hidden className="absolute inset-0 origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100" style={{ backgroundColor: STAR }} />
        )}
        <span className="relative opacity-50 transition-opacity group-hover:opacity-100">[</span>
        <span className={`relative uppercase ${!primary ? "transition-colors duration-300 group-hover:text-[#0B0E14]" : ""}`}>{label}</span>
        <span className="relative opacity-50 transition-opacity group-hover:opacity-100">]</span>
      </a>
    </Magnetic>
  )
}

// ── Masthead ──────────────────────────────────────────────────────────────────
const NAV_LINKS = [
  { href: "/method", label: "Method" },
  { href: "/journal", label: "Journal" },
  { href: "/about", label: "About" },
  { href: "/#pricing", label: "Pricing" },
] as const

export function Masthead() {
  return (
    <header className="fixed inset-x-0 top-0 z-50" style={{ backgroundColor: "rgba(7,9,14,0.82)", backdropFilter: "blur(6px)", borderBottom: `1px solid ${LINE}` }}>
      <nav className="mx-auto flex max-w-6xl items-stretch justify-between px-6">
        <a href="/" className="flex items-center gap-3 py-3.5">
          <Logo size={28} />
          <span className="text-[18px] font-bold tracking-tight" style={{ fontFamily: DISPLAY, color: STAR }}>Researca</span>
        </a>
        <div className="hidden items-stretch md:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="flex items-center border-l px-6 transition-colors hover:text-[var(--highlight)]" style={{ borderColor: LINE }}>
              <Mono className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{l.label}</Mono>
            </a>
          ))}
          <a href="/auth" className="flex items-center border-l px-6" style={{ borderColor: LINE, backgroundColor: GOLD }}>
            <Mono className="text-[11px]" style={{ color: INK, fontWeight: 600 }}>Start free</Mono>
          </a>
        </div>
        <a href="/auth" className="flex items-center md:hidden">
          <Mono className="text-[11px]" style={{ color: GOLD }}>Start</Mono>
        </a>
      </nav>
    </header>
  )
}

// ── Ticker — scrolling editorial band ─────────────────────────────────────────
export function Ticker({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
  const row = [...items, ...items]
  return (
    <div aria-hidden className="relative w-full overflow-hidden py-3" style={{ borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
      <div className={`ticker-track ${reverse ? "ticker-reverse" : ""}`}>
        {row.map((it, i) => (
          <span key={i} className="mx-6 inline-flex items-center gap-6">
            <Mono className="text-[12px]" style={{ color: i % 2 ? "var(--text-muted)" : STAR }}>{it}</Mono>
            <span style={{ color: GOLD }}>✦</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Colophon footer ───────────────────────────────────────────────────────────
const FOOTER_COLS: { heading: string; links: { label: string; href: string; ext?: boolean }[] }[] = [
  { heading: "Read", links: [{ label: "Method", href: "/method" }, { label: "Journal", href: "/journal" }, { label: "About", href: "/about" }] },
  { heading: "Product", links: [{ label: "Pricing", href: "/#pricing" }, { label: "Manuscript ed.", href: "/manuscript" }] },
  { heading: "Account", links: [{ label: "Sign in", href: "/auth" }, { label: "Start free", href: "/auth" }] },
  { heading: "Elsewhere", links: [{ label: "GitHub", href: "https://github.com/Araadh3111/research-copilot", ext: true }, { label: "X / Twitter", href: "https://x.com/araadhsingh1", ext: true }] },
]

export function Colophon() {
  return (
    <footer className="relative z-10 w-full px-6 pb-12 pt-14">
      <div className="mx-auto max-w-6xl">
        <RuleDraw strong className="mb-10" />
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-5 sm:gap-8">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2.5">
              <Logo size={24} />
              <span className="text-[19px] font-bold" style={{ fontFamily: DISPLAY, color: STAR }}>Researca</span>
            </div>
            <p className="mt-3 max-w-[15rem] text-[13px] leading-relaxed" style={{ fontFamily: BODY, color: "var(--text-secondary)" }}>
              Literature review in thirty seconds. Real papers, real citations.
            </p>
          </div>
          {FOOTER_COLS.map((col) => (
            <div key={col.heading}>
              <Mono className="text-[10px]" style={{ color: GOLD }}>{col.heading}</Mono>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} {...(l.ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="text-[13.5px] transition-colors hover:text-[var(--highlight)]" style={{ fontFamily: BODY, color: "var(--text-body)" }}>{l.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12"><Rule /></div>
        <div className="flex flex-col gap-2 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <Mono className="text-[10px]" style={{ color: "var(--text-muted)" }}>Built by Araadh · Age 15 · Chandigarh, India</Mono>
          <Mono className="text-[10px]" style={{ color: "var(--text-muted)" }}>© 2026 Researca</Mono>
        </div>
      </div>
    </footer>
  )
}

// ── Section header band ───────────────────────────────────────────────────────
export function SectionHead({ num, label, title }: { num: string; label: string; title: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-6">
      <RuleDraw strong />
      <div className="flex items-baseline justify-between py-5">
        <Mono className="text-[11px]" style={{ color: GOLD }}>{num}</Mono>
        <Mono className="text-[11px]" style={{ color: "var(--text-muted)" }}>{label}</Mono>
      </div>
      <h2 className="max-w-3xl pb-10 text-[clamp(30px,5vw,58px)] font-black uppercase leading-[0.95] tracking-[-0.02em]" style={{ fontFamily: DISPLAY, color: STAR }}>
        {title}
      </h2>
    </div>
  )
}

// Standard reveal for in-view content.
export const reveal = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, ease: EASE_OUT },
} as const

// ── Page shell — masthead + faint sky + content + footer for sub-pages ────────
const SkyFieldLazy = () => null // sub-pages use the static CSS sky only (lighter)

export function PageShell({ children, eyebrow, title, lede }: { children?: ReactNode; eyebrow: string; title: ReactNode; lede?: string }) {
  useForceDark()
  void SkyFieldLazy
  return (
    <main className="relative min-h-screen bg-canvas">
      <Masthead />
      <div className="relative z-10 pt-[57px]">
        {/* Page header */}
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex items-center justify-between py-6">
            <Mono className="text-[10px]" style={{ color: "var(--text-muted)" }}>{eyebrow}</Mono>
            <Mono className="text-[10px]" style={{ color: "var(--text-muted)" }}>Researca · 2026</Mono>
          </div>
          <Rule strong />
          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE_OUT }}
            className="max-w-4xl py-10 text-[clamp(40px,8vw,96px)] font-black uppercase leading-[0.9] tracking-[-0.03em]"
            style={{ fontFamily: DISPLAY, color: STAR }}>
            {title}
          </motion.h1>
          {lede && (
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.7, ease: EASE_OUT }}
              className="max-w-2xl pb-12 text-[17px] leading-relaxed sm:text-[19px]" style={{ fontFamily: BODY, color: "var(--text-body)" }}>
              {lede}
            </motion.p>
          )}
          <Rule strong />
        </div>
        {children}
        <Colophon />
      </div>
    </main>
  )
}
