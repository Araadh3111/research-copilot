"use client"

/**
 * THE OBSERVATORY — Researca's landing, bold-editorial / brutalist edition.
 *
 * Structure over effects. The page reads like the cover and inside spread of a
 * serious journal: a ruled masthead, a giant cover headline, hard 1px rules
 * dividing every section, mono metadata in the margins, sharp corners, near-
 * zero motion. The night sky (ink-black ground + a faint starfield texture) is
 * atmosphere only — the TYPE and the GRID are the design.
 *
 * Deliberately removed from the first pass: glows, twinkle, shooting stars,
 * glassy blur, pill buttons, emoji icons. What's left is meant to look
 * intentional, not generated.
 */

import { Fragment, useEffect, useRef, useState } from "react"
import { ReactLenis } from "lenis/react"
import dynamic from "next/dynamic"
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
  type Variants,
} from "motion/react"
import { Logo } from "@/components/logo"

const SkyField = dynamic(
  () => import("@/components/landing/sky-field").then((m) => m.SkyField),
  { ssr: false },
)

const GOLD = "#D4AF37"
const STAR = "#EDF1F7"
const INK = "#0B0E14"
const LINE = "rgba(237,241,247,0.14)"
const LINE_STRONG = "rgba(237,241,247,0.30)"
const EASE_OUT = [0.22, 1, 0.36, 1] as const
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

// ── Demo data ─────────────────────────────────────────────────────────────────
const QUERY = "CRISPR off-target effects in human cells"

type Paper = { n: number; score: number; title: string; authors: string; venue: string; year: string }
const PAPERS: Paper[] = [
  { n: 1, score: 97, title: "Genome-wide profiling of Cas9 off-target activity", authors: "Tsai et al.", venue: "Nat. Biotechnol.", year: "2015" },
  { n: 2, score: 95, title: "High-fidelity Cas9 variants with minimized off-targets", authors: "Kleinstiver et al.", venue: "Nature", year: "2016" },
  { n: 3, score: 92, title: "GUIDE-seq for unbiased genome-wide detection", authors: "Tsai et al.", venue: "Nat. Biotechnol.", year: "2015" },
  { n: 4, score: 88, title: "Anti-CRISPR proteins constrain off-target cleavage", authors: "Shin et al.", venue: "Sci. Adv.", year: "2017" },
]
// Scrambled entry order → final rank, so the list visibly re-sorts.
const SCRAMBLE = [2, 0, 3, 1]
const ROW_PITCH = 84

type Token = { t: string; cite?: boolean }
const SYNTHESIS: Token[] = [
  { t: "High-fidelity" }, { t: "Cas9" }, { t: "variants" }, { t: "[2]", cite: true },
  { t: "and" }, { t: "anti-CRISPR" }, { t: "proteins" }, { t: "[4]", cite: true },
  { t: "cut" }, { t: "off-target" }, { t: "cleavage" }, { t: "up" }, { t: "to" }, { t: "40%," },
  { t: "while" }, { t: "GUIDE-seq" }, { t: "[3]", cite: true },
  { t: "verifies" }, { t: "remaining" }, { t: "edits" }, { t: "genome-wide" }, { t: "[1].", cite: true },
]

// ── Primitives ────────────────────────────────────────────────────────────────
function Rule({ strong = false, className = "" }: { strong?: boolean; className?: string }) {
  return <div aria-hidden className={`w-full ${className}`} style={{ height: 1, backgroundColor: strong ? LINE_STRONG : LINE }} />
}

function Mono({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`uppercase ${className}`} style={{ fontFamily: "var(--font-pt-mono), monospace", letterSpacing: "0.18em", ...style }}>
      {children}
    </span>
  )
}

// Rectangular, sharp-cornered buttons — bracketed mono label.
function CoverButton({ label, href = "/auth", primary = true }: { label: string; href?: string; primary?: boolean }) {
  return (
    <a
      href={href}
      className="group inline-flex items-center gap-3 px-7 py-3.5 text-[12px] transition-colors duration-200"
      style={{
        backgroundColor: primary ? GOLD : "transparent",
        color: primary ? INK : STAR,
        border: `1px solid ${primary ? GOLD : LINE_STRONG}`,
        fontFamily: "var(--font-pt-mono), monospace",
        letterSpacing: "0.2em",
        fontWeight: 600,
      }}
    >
      <span className="opacity-50 transition-opacity group-hover:opacity-100">[</span>
      <span className="uppercase">{label}</span>
      <span className="opacity-50 transition-opacity group-hover:opacity-100">]</span>
    </a>
  )
}

// Section header band: a number, a label, a rule. Shared editorial chrome.
function SectionHead({ num, label, title }: { num: string; label: string; title: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-6">
      <Rule strong />
      <div className="flex items-baseline justify-between py-5">
        <Mono className="text-[11px]" style={{ color: GOLD }}>{num}</Mono>
        <Mono className="text-[11px]" style={{ color: "var(--text-muted)" }}>{label}</Mono>
      </div>
      <h2 className="max-w-3xl pb-10 text-[clamp(30px,5vw,58px)] font-semibold leading-[0.98] tracking-tight"
        style={{ fontFamily: "var(--font-playfair), Georgia, serif", color: STAR }}>
        {title}
      </h2>
    </div>
  )
}

// ── Masthead nav (always-visible hard rule = brutalist structure) ─────────────
const NAV_LINKS = [
  { href: "#method", label: "Method" },
  { href: "#why", label: "Why" },
  { href: "#pricing", label: "Pricing" },
] as const

function Masthead() {
  return (
    <header className="fixed inset-x-0 top-0 z-50" style={{ backgroundColor: "rgba(7,9,14,0.82)", backdropFilter: "blur(6px)", borderBottom: `1px solid ${LINE}` }}>
      <nav className="mx-auto flex max-w-6xl items-stretch justify-between px-6">
        <a href="/" className="flex items-center gap-3 py-3.5">
          <Logo size={28} />
          <span className="text-[18px] font-semibold tracking-tight" style={{ fontFamily: "var(--font-playfair), Georgia, serif", color: STAR }}>Researca</span>
        </a>
        <div className="hidden items-center md:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="flex h-full items-center border-l px-6 transition-colors hover:text-[var(--highlight)]"
              style={{ borderColor: LINE }}>
              <Mono className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{l.label}</Mono>
            </a>
          ))}
          <a href="/auth" className="flex h-full items-center border-l px-6 transition-colors"
            style={{ borderColor: LINE, backgroundColor: GOLD }}>
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

// ── Hero — the cover ───────────────────────────────────────────────────────────
const headlineContainer: Variants = { hidden: {}, show: { transition: { delayChildren: 0.15, staggerChildren: 0.08 } } }
const lineReveal: Variants = {
  hidden: { opacity: 0, y: "0.4em" },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_OUT } },
}
const HEAD_LINES = ["Literature review,", "in thirty seconds."]

function Hero({ reduced }: { reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] })
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0])
  const cueOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0])

  const fade = (delay: number) => ({
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.8, ease: EASE_OUT },
  })

  return (
    <section ref={ref} data-act={0} className="relative z-10 min-h-screen w-full pt-[57px]">
      <motion.div style={{ opacity }} className="mx-auto flex min-h-[calc(100vh-57px)] max-w-6xl flex-col px-6">
        {/* Cover meta row */}
        <motion.div {...fade(0.05)} className="flex items-center justify-between py-6">
          <Mono className="text-[10px]" style={{ color: "var(--text-muted)" }}>Est. 2026 · Chandigarh</Mono>
          <Mono className="text-[10px]" style={{ color: "var(--text-muted)" }}>An observatory for the literature</Mono>
        </motion.div>
        <Rule strong />

        {/* Cover spread: headline left, index right */}
        <div className="grid flex-1 grid-cols-1 items-center gap-12 py-12 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <motion.h1 variants={headlineContainer} initial="hidden" animate="show"
              className="text-[clamp(44px,9vw,118px)] font-semibold leading-[0.92] tracking-[-0.02em]"
              style={{ fontFamily: "var(--font-playfair), Georgia, serif", color: STAR }}>
              {HEAD_LINES.map((line, i) => (
                <span key={i} className="block overflow-hidden">
                  <motion.span variants={lineReveal} className="block" style={i === 1 ? { color: GOLD } : undefined}>
                    {line}
                  </motion.span>
                </span>
              ))}
            </motion.h1>
            <motion.p {...fade(0.9)} className="mt-8 max-w-xl text-[16px] leading-relaxed sm:text-[17px]"
              style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-body)" }}>
              Researca reads real academic papers in full, ranks them by what actually matters,
              and returns one synthesis — with every claim linked to its source.
            </motion.p>
            <motion.div {...fade(1.1)} className="mt-10 flex flex-wrap items-center gap-3">
              <CoverButton label="Begin researching" />
              <CoverButton label="Watch it work" href="#method" primary={false} />
            </motion.div>
          </div>

          {/* Index column — the "contents" block */}
          <motion.div {...fade(0.7)} className="border-t pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0" style={{ borderColor: LINE }}>
            <Mono className="text-[10px]" style={{ color: "var(--text-muted)" }}>In this issue</Mono>
            <ol className="mt-5 space-y-4">
              {[
                ["01", "Ask in plain language"],
                ["02", "Read the papers in full"],
                ["03", "Rank by real relevance"],
                ["04", "Return a cited answer"],
              ].map(([n, t]) => (
                <li key={n} className="flex items-baseline gap-4">
                  <Mono className="text-[11px]" style={{ color: GOLD }}>{n}</Mono>
                  <span className="text-[15px]" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: STAR }}>{t}</span>
                </li>
              ))}
            </ol>
          </motion.div>
        </div>

        <Rule strong />
        <motion.div style={{ opacity: cueOpacity }} className="flex items-center justify-between py-5">
          <Mono className="text-[10px]" style={{ color: "var(--text-muted)" }}>Scroll to observe ↓</Mono>
          <Mono className="text-[10px]" style={{ color: "var(--text-muted)" }}>Fig. 01 — the constellation</Mono>
        </motion.div>
      </motion.div>
    </section>
  )
}

// ── The working demo — ledger that re-ranks, then a cited synthesis ──────────
// Brutalist treatment of the original "constellation": papers are a numbered
// LEDGER that visibly re-sorts by relevance, then collapses into a flat,
// hard-ruled synthesis block. Hard dots + thin gold rules, no glow/twinkle.
function DemoAct() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] })
  const [shownChars, setShownChars] = useState(0)
  useEffect(() => {
    const unsub = p.on("change", (v) => {
      const t = clamp((v - 0.02) / (0.13 - 0.02), 0, 1)
      setShownChars(Math.round(t * QUERY.length))
    })
    return () => unsub()
  }, [p])
  const typing = shownChars < QUERY.length

  const ledgerOpacity = useTransform(p, [0.55, 0.64], [1, 0])
  const ledgerY = useTransform(p, [0.55, 0.64], [0, -20])
  const labelPhase = useTransform(p, [0, 0.42, 0.55, 1], [0, 0, 1, 1])
  const answerOpacity = useTransform(p, [0.6, 0.69], [0, 1])
  const answerY = useTransform(p, [0.6, 0.69], [20, 0])
  const footOpacity = useTransform(p, [0.9, 1], [0, 1])

  return (
    <section ref={ref} data-act={1} className="relative z-10" style={{ height: "520vh" }}>
      <div className="sticky top-0 flex h-screen w-full items-center overflow-hidden">
        <div className="mx-auto w-full max-w-4xl px-6">
          {/* Query line — a ledger entry */}
          <div className="flex items-baseline gap-4 pb-5">
            <Mono className="shrink-0 text-[10px]" style={{ color: GOLD }}>Query</Mono>
            <p className="text-[18px] leading-snug sm:text-[22px]" style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontStyle: "italic", color: STAR }}>
              {QUERY.slice(0, shownChars)}
              {typing && <span className="ml-0.5 inline-block h-[0.85em] w-[2px] translate-y-[0.1em] animate-caret" style={{ backgroundColor: GOLD }} />}
            </p>
          </div>
          <Rule strong />

          {/* Stage label */}
          <div className="py-4">
            <DemoLabel phase={labelPhase} />
          </div>

          {/* The stage: ledger and answer share one box */}
          <div className="relative" style={{ minHeight: ROW_PITCH * PAPERS.length + 10 }}>
            <motion.div style={{ opacity: ledgerOpacity, y: ledgerY }} className="absolute inset-0">
              {PAPERS.map((paper, i) => (
                <LedgerRow key={paper.n} paper={paper} rank={i} fromSlot={SCRAMBLE[i]} progress={p} />
              ))}
            </motion.div>

            <motion.div style={{ opacity: answerOpacity, y: answerY }} className="absolute inset-0 flex items-start">
              <div className="w-full border-l-2 pl-6" style={{ borderColor: GOLD }}>
                <p className="text-[19px] leading-relaxed sm:text-[23px]" style={{ fontFamily: "var(--font-playfair), Georgia, serif", color: STAR }}>
                  {SYNTHESIS.map((tok, i) => (
                    <SynthWord key={i} token={tok} index={i} total={SYNTHESIS.length} progress={p} />
                  ))}
                </p>
                <motion.div style={{ opacity: footOpacity, borderColor: LINE }} className="mt-7 border-t pt-5">
                  <div className="space-y-1.5">
                    {PAPERS.map((pp) => (
                      <p key={pp.n} className="text-[11px] leading-relaxed" style={{ fontFamily: "var(--font-pt-mono), monospace", color: "var(--text-secondary)" }}>
                        <span style={{ color: GOLD }}>[{pp.n}]</span> {pp.authors} · {pp.title}. {pp.venue}, {pp.year}.
                      </p>
                    ))}
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
          <Rule strong className="mt-2" />
        </div>
      </div>
    </section>
  )
}

function DemoLabel({ phase }: { phase: MotionValue<number> }) {
  const a = useTransform(phase, [0, 0.5], [1, 0])
  const b = useTransform(phase, [0.5, 1], [0, 1])
  return (
    <div className="relative h-4">
      <motion.div style={{ opacity: a }} className="absolute inset-0">
        <Mono className="text-[11px]" style={{ color: "var(--text-muted)" }}>Reading 24 papers in full · ranking by relevance</Mono>
      </motion.div>
      <motion.div style={{ opacity: b }} className="absolute inset-0">
        <Mono className="text-[11px]" style={{ color: "var(--text-muted)" }}>One synthesis · every claim cited</Mono>
      </motion.div>
    </div>
  )
}

function LedgerRow({ paper, rank, fromSlot, progress }: { paper: Paper; rank: number; fromSlot: number; progress: MotionValue<number> }) {
  const e0 = 0.05 + fromSlot * 0.025
  const opacity = useTransform(progress, [e0, e0 + 0.08], [0, 1])
  const sc0 = 0.22 + rank * 0.012
  const scoreOpacity = useTransform(progress, [sc0, sc0 + 0.06], [0, 1])
  const slot = useTransform(progress, [0.32, 0.48], [fromSlot, rank])
  const y = useTransform(slot, (s) => s * ROW_PITCH)
  const ordinalOpacity = useTransform(progress, [0.48, 0.54], [0, 1])

  return (
    <motion.div style={{ y, opacity }} className="absolute inset-x-0 top-0">
      <div className="flex items-center gap-5 py-4" style={{ borderTop: `1px solid ${LINE}` }}>
        <motion.span style={{ opacity: ordinalOpacity }} className="w-6 shrink-0">
          <Mono className="text-[13px] tabular-nums" style={{ color: "var(--text-muted)" }}>{String(rank + 1).padStart(2, "0")}</Mono>
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] sm:text-[17px]" style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontWeight: 600, color: STAR }}>{paper.title}</p>
          <p className="mt-0.5 text-[11px]" style={{ fontFamily: "var(--font-pt-mono), monospace", color: "var(--text-muted)" }}>{paper.authors} · {paper.venue} · {paper.year}</p>
        </div>
        <motion.div style={{ opacity: scoreOpacity }} className="shrink-0 text-right">
          <span className="text-[22px] font-bold tabular-nums leading-none" style={{ fontFamily: "var(--font-pt-mono), monospace", color: GOLD }}>{paper.score}</span>
          <Mono className="ml-1 text-[9px]" style={{ color: "var(--text-muted)" }}>rel</Mono>
        </motion.div>
      </div>
    </motion.div>
  )
}

function SynthWord({ token, index, total, progress }: { token: Token; index: number; total: number; progress: MotionValue<number> }) {
  const start = 0.66 + (index / total) * 0.26
  const end = start + 0.03
  const opacity = useTransform(progress, [start, end], [0.14, 1])
  if (token.cite) {
    return (
      <motion.span style={{ opacity }} className="mx-0.5 inline-block translate-y-[-0.12em] align-super text-[0.5em] font-bold">
        <span className="px-1 py-0.5" style={{ backgroundColor: GOLD, color: INK, fontFamily: "var(--font-pt-mono), monospace" }}>{token.t}</span>
      </motion.span>
    )
  }
  return <motion.span style={{ opacity }} className="mr-[0.26em] inline-block">{token.t}</motion.span>
}

// ── Method ──────────────────────────────────────────────────────────────────
const STEPS = [
  { k: "01", title: "Ask in plain language", body: "No boolean operators, no database syntax. Describe what you're trying to understand." },
  { k: "02", title: "Researca reads in full", body: "It pulls the relevant papers and reads the actual text — not just abstracts — ranking by true relevance." },
  { k: "03", title: "Get a cited synthesis", body: "One clear answer with every claim linked to its source. Open any paper and verify it yourself." },
]
const reveal = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, ease: EASE_OUT },
} as const

function Method() {
  return (
    <section id="method" className="relative z-10 w-full scroll-mt-16 pt-20">
      <SectionHead num="§ 01" label="The method" title={<>From a question to a <span style={{ color: GOLD }}>cited answer.</span></>} />
      <div className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid grid-cols-1 border-t sm:grid-cols-3" style={{ borderColor: LINE_STRONG }}>
          {STEPS.map((s, i) => (
            <motion.div key={s.k} {...reveal} transition={{ ...reveal.transition, delay: i * 0.1 }}
              className="border-b px-2 py-8 sm:border-b-0 sm:px-7 sm:[&:not(:first-child)]:border-l"
              style={{ borderColor: LINE }}>
              <Mono className="text-[11px]" style={{ color: GOLD }}>{s.k}</Mono>
              <h3 className="mt-4 text-[21px]" style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontWeight: 600, color: STAR }}>{s.title}</h3>
              <p className="mt-3 text-[14.5px] leading-relaxed" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-body)" }}>{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Why (features) ───────────────────────────────────────────────────────────
const FEATURES = [
  { k: "A", title: "Relevance-ranked", body: "Papers ranked by what matters to your query — not how often they've been cited." },
  { k: "B", title: "Cross-paper synthesis", body: "Finds where the literature agrees, disagrees, and goes silent — the analysis a researcher actually needs." },
  { k: "C", title: "Verify in one click", body: "Every claim links to its exact source. No invented citations, ever." },
]
function Why() {
  return (
    <section id="why" className="relative z-10 w-full scroll-mt-16 pt-12">
      <SectionHead num="§ 02" label="Why researchers trust it" title={<>Built to be checked, not trusted blindly.</>} />
      <div className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid grid-cols-1 gap-px sm:grid-cols-3" style={{ backgroundColor: LINE }}>
          {FEATURES.map((f, i) => (
            <motion.div key={f.k} {...reveal} transition={{ ...reveal.transition, delay: i * 0.1 }}
              className="px-7 py-9" style={{ backgroundColor: INK }}>
              <div className="flex h-9 w-9 items-center justify-center" style={{ border: `1px solid ${GOLD}` }}>
                <Mono className="text-[13px]" style={{ color: GOLD, letterSpacing: 0 }}>{f.k}</Mono>
              </div>
              <h3 className="mt-5 text-[20px]" style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontWeight: 600, color: STAR }}>{f.title}</h3>
              <p className="mt-3 text-[14.5px] leading-relaxed" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-body)" }}>{f.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Pricing ─────────────────────────────────────────────────────────────────
type Tier = { name: string; price: string; period: string; featured: boolean; cta: string; points: string[] }
const TIERS: Tier[] = [
  { name: "Free", price: "$0", period: "forever", featured: false, cta: "Start for free", points: ["25 free searches to start, then 10 / month", "Full-text reading & synthesis", "Every claim cited"] },
  { name: "Pro", price: "$12", period: "/mo · $96/yr", featured: true, cta: "Start Pro trial", points: ["120 searches / month", "Comparison matrix", "CSV + BibTeX export", "Deeper synthesis on our most capable model"] },
]
function Pricing() {
  return (
    <section id="pricing" className="relative z-10 w-full scroll-mt-16 pt-12">
      <SectionHead num="§ 03" label="Simple, honest pricing" title={<>Start free. Upgrade when it earns it.</>} />
      <div className="mx-auto max-w-4xl px-6 pb-16">
        <div className="grid grid-cols-1 border md:grid-cols-2" style={{ borderColor: LINE_STRONG }}>
          {TIERS.map((t, i) => (
            <motion.div key={t.name} {...reveal} transition={{ ...reveal.transition, delay: i * 0.1 }}
              className="flex flex-col p-8" style={{ borderColor: LINE_STRONG, borderLeft: i === 1 ? `1px solid ${LINE_STRONG}` : undefined, backgroundColor: t.featured ? "rgba(212,175,55,0.05)" : "transparent" }}>
              <div className="flex items-baseline justify-between">
                <h3 className="text-[28px]" style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontWeight: 600, color: STAR }}>{t.name}</h3>
                {t.featured && <Mono className="text-[10px] px-2 py-0.5" style={{ color: INK, backgroundColor: GOLD }}>Popular</Mono>}
              </div>
              <p className="mt-3" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-secondary)" }}>
                <span className="text-3xl font-semibold" style={{ color: STAR }}>{t.price}</span>{" "}
                <Mono className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t.period}</Mono>
              </p>
              <ul className="mt-7 flex-1 space-y-3">
                {t.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-3 text-[14px]" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-body)" }}>
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0" style={{ backgroundColor: GOLD }} />{pt}
                  </li>
                ))}
              </ul>
              <div className="mt-8"><CoverButton label={t.cta} primary={t.featured} /></div>
            </motion.div>
          ))}
        </div>
        <p className="mt-6 text-[13px]" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-secondary)" }}>
          Students &amp; researchers in developing countries —{" "}
          <a href="mailto:araadh3111@gmail.com" className="underline underline-offset-2" style={{ color: STAR, textDecorationColor: GOLD }}>email for a discount</a>.
        </p>
      </div>
    </section>
  )
}

// ── Final CTA ─────────────────────────────────────────────────────────────────
function FinalCta() {
  return (
    <section className="relative z-10 w-full pt-8">
      <div className="mx-auto max-w-6xl px-6">
        <Rule strong />
        <motion.div {...reveal} className="flex flex-col items-start gap-8 py-20 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="max-w-2xl text-[clamp(34px,6vw,76px)] font-semibold leading-[0.95] tracking-tight"
            style={{ fontFamily: "var(--font-playfair), Georgia, serif", color: STAR }}>
            Point it at your<br />question.
          </h2>
          <div className="shrink-0">
            <p className="mb-5 max-w-xs text-[14px] leading-relaxed" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-body)" }}>
              Your first literature review is thirty seconds away. No credit card.
            </p>
            <CoverButton label="Begin researching" />
          </div>
        </motion.div>
        <Rule strong />
      </div>
    </section>
  )
}

// ── Colophon ───────────────────────────────────────────────────────────────
const FOOTER_COLS: { heading: string; links: { label: string; href: string; ext?: boolean }[] }[] = [
  { heading: "Product", links: [{ label: "Method", href: "#method" }, { label: "Why", href: "#why" }, { label: "Pricing", href: "#pricing" }] },
  { heading: "Account", links: [{ label: "Sign in", href: "/auth" }, { label: "Start free", href: "/auth" }] },
  { heading: "Resources", links: [{ label: "GitHub", href: "https://github.com/Araadh3111/research-copilot", ext: true }, { label: "X / Twitter", href: "https://x.com/araadhsingh1", ext: true }] },
]
function Colophon() {
  return (
    <footer className="relative z-10 w-full px-6 pb-12 pt-14">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 sm:gap-8">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2.5">
              <Logo size={24} />
              <span className="text-[19px] font-semibold" style={{ fontFamily: "var(--font-playfair), Georgia, serif", color: STAR }}>Researca</span>
            </div>
            <p className="mt-3 max-w-[15rem] text-[13px] leading-relaxed" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-secondary)" }}>
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
                      className="text-[13.5px] transition-colors hover:text-[var(--highlight)]"
                      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-body)" }}>{l.label}</a>
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

// ── Page ────────────────────────────────────────────────────────────────────
export function ObservatoryLanding() {
  const prefersReduced = useReducedMotion()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const reduced = mounted && !!prefersReduced

  // Force night for the landing regardless of any saved 'light' preference —
  // the page is starlight-on-ink and would be invisible on the pale theme.
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

  const { scrollYProgress: pageProgress } = useScroll()

  return (
    <>
      <ReactLenis root options={{ lerp: 0.09, wheelMultiplier: 1, smoothWheel: true }} />
      <main className="relative bg-canvas">
        <Masthead />
        {mounted && !reduced && <SkyField scrollProgress={pageProgress} />}
        <div className="relative z-10">
          <Hero reduced={reduced} />
          <DemoAct />
          <Method />
          <Why />
          <Pricing />
          <FinalCta />
          <Colophon />
        </div>
      </main>
    </>
  )
}
