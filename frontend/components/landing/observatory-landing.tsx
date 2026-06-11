"use client"

/**
 * THE OBSERVATORY — Researca's landing.
 *
 * The conceit: research is reading the night sky. You ask a question; Researca
 * lights up the papers that matter as stars, draws the line between them (the
 * constellation = the synthesis), and hands you a cited answer. Night is the
 * canonical theme, so this page is built dark-first over a live 3D starfield.
 *
 * Structure:
 *   • SkyField (fixed 3D starfield, scroll-driven fly-through)        — behind all
 *   • Hero            — the wordmark + promise, a telescope pointing up
 *   • ConstellationAct — scrollytelling: query → stars ignite → lines draw →
 *                        cited synthesis materialises at the centre
 *   • FeatureOrbits   — the three differentiators as orbiting cards
 *   • Pricing         — Free / Pro, re-skinned for the night
 *   • Colophon        — the back-matter footer
 *
 * Motion is scroll-scrubbed via Framer Motion `useScroll`/`useTransform`, with a
 * single page-level progress MotionValue piped into the 3D rig so scroll never
 * triggers a React re-render of the canvas.
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

// The 3D field is client-only and heavy; load it lazily so first paint (the
// CSS sky + type) is instant and the canvas hydrates after.
const SkyField = dynamic(
  () => import("@/components/landing/sky-field").then((m) => m.SkyField),
  { ssr: false },
)

const GOLD = "#D4AF37"
const TEAL = "#2DD4BF"
const STAR = "#EDF1F7"
const EASE_OUT = [0.22, 1, 0.36, 1] as const

// ── Demo data: one question carried through the whole sky ─────────────────────
const QUERY = "CRISPR off-target effects in human cells"

type Star = { n: number; score: number; title: string; authors: string; venue: string; year: string; x: number; y: number }
// x/y are percentages within the constellation stage (a 0–100 box).
const STARS: Star[] = [
  { n: 1, score: 97, title: "Genome-wide profiling of Cas9 off-target activity", authors: "Tsai et al.", venue: "Nat. Biotechnol.", year: "2015", x: 26, y: 30 },
  { n: 2, score: 95, title: "High-fidelity Cas9 variants with minimized off-targets", authors: "Kleinstiver et al.", venue: "Nature", year: "2016", x: 70, y: 22 },
  { n: 3, score: 92, title: "GUIDE-seq for unbiased genome-wide detection", authors: "Tsai et al.", venue: "Nat. Biotechnol.", year: "2015", x: 78, y: 64 },
  { n: 4, score: 88, title: "Anti-CRISPR proteins constrain off-target cleavage", authors: "Shin et al.", venue: "Sci. Adv.", year: "2017", x: 32, y: 70 },
]
// Order the constellation line connects the stars (by relevance walk).
const EDGES: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0]]

type Token = { t: string; cite?: boolean }
const SYNTHESIS: Token[] = [
  { t: "High-fidelity" }, { t: "Cas9" }, { t: "variants" }, { t: "[2]", cite: true },
  { t: "and" }, { t: "anti-CRISPR" }, { t: "proteins" }, { t: "[4]", cite: true },
  { t: "cut" }, { t: "off-target" }, { t: "cleavage" }, { t: "up" }, { t: "to" }, { t: "40%," },
  { t: "while" }, { t: "GUIDE-seq" }, { t: "[3]", cite: true },
  { t: "verifies" }, { t: "the" }, { t: "remaining" }, { t: "edits" }, { t: "genome-wide" }, { t: "[1].", cite: true },
]

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

// ── Shared bits ───────────────────────────────────────────────────────────────
function Eyebrow({ children, color = GOLD }: { children: React.ReactNode; color?: string }) {
  return (
    <p className="ms-label text-[11px] tracking-[0.35em]" style={{ color }}>
      {children}
    </p>
  )
}

function StarButton({ label, href = "/auth", solid = true }: { label: string; href?: string; solid?: boolean }) {
  return (
    <a
      href={href}
      className={`group relative inline-flex items-center gap-2.5 rounded-full px-8 py-3.5 text-[14px] tracking-[0.02em] transition-transform duration-300 hover:-translate-y-0.5 ${solid ? "glow-gold" : ""}`}
      style={{
        backgroundColor: solid ? GOLD : "transparent",
        color: solid ? "#0B0E14" : STAR,
        border: solid ? "none" : "1px solid var(--border-strong)",
        fontFamily: "var(--font-inter), system-ui, sans-serif",
        fontWeight: 600,
      }}
    >
      <span aria-hidden className="text-[12px] transition-transform duration-300 group-hover:rotate-90">✦</span>
      {label}
    </a>
  )
}

// ── Top nav ─────────────────────────────────────────────────────────────────
const NAV_LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
] as const

function ObservatoryNav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])
  return (
    <header
      className="fixed inset-x-0 top-0 z-50 transition-colors duration-500"
      style={{
        backgroundColor: scrolled ? "rgba(11,14,20,0.72)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        borderBottom: scrolled ? "1px solid var(--border-soft)" : "1px solid transparent",
      }}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="/" className="flex items-center gap-2.5">
          <Logo size={30} />
          <span className="text-[19px]" style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontWeight: 600, color: STAR }}>
            Researca
          </span>
        </a>
        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[13.5px] transition-colors hover:text-[var(--highlight)]"
              style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-secondary)" }}
            >
              {l.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/auth"
            className="hidden text-[13.5px] transition-colors hover:text-[var(--highlight)] sm:block"
            style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-secondary)" }}
          >
            Sign in
          </a>
          <a
            href="/auth"
            className="rounded-full px-5 py-2 text-[13px] font-semibold transition-transform duration-300 hover:-translate-y-0.5"
            style={{ backgroundColor: GOLD, color: "#0B0E14", fontFamily: "var(--font-inter), system-ui, sans-serif" }}
          >
            Start free
          </a>
        </div>
      </nav>
    </header>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────
const headlineContainer: Variants = {
  hidden: {},
  show: { transition: { delayChildren: 0.2, staggerChildren: 0.12 } },
}
const wordReveal: Variants = {
  hidden: { opacity: 0, y: "0.5em", filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.8, ease: EASE_OUT } },
}
const HEADLINE = "Read the night sky of science."

function Hero({ reduced }: { reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] })
  const y = useTransform(scrollYProgress, [0, 1], [0, -120])
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0])
  const cueOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0])
  const words = HEADLINE.split(" ")

  const fadeUp = (delay: number) => ({
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.9, ease: EASE_OUT },
  })

  return (
    <section ref={ref} data-act={0} className="relative z-10 min-h-screen w-full">
      <motion.div style={{ y, opacity }} className="flex min-h-screen w-full flex-col items-center justify-center px-6 pt-20">
        <motion.div {...fadeUp(0.1)} className="mb-8 inline-flex items-center gap-2 rounded-full border px-4 py-1.5"
          style={{ borderColor: "var(--border-soft)", backgroundColor: "rgba(21,26,38,0.5)" }}>
          <span className="size-1.5 rounded-full glow-signal" style={{ backgroundColor: TEAL }} />
          <span className="ms-label text-[10px] tracking-[0.25em]" style={{ color: "var(--text-secondary)" }}>
            Reads real papers · cites every claim
          </span>
        </motion.div>

        <motion.h1
          variants={headlineContainer}
          initial="hidden"
          animate="show"
          className="max-w-4xl text-center text-5xl leading-[1.05] tracking-tight sm:text-6xl md:text-7xl lg:text-[5.25rem]"
          style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontWeight: 600, color: STAR }}
        >
          {words.map((word, i) => {
            const accent = word.toLowerCase().startsWith("sky")
            return (
              <Fragment key={i}>
                <motion.span variants={wordReveal} className="inline-block" style={accent ? { color: GOLD } : undefined}>
                  {word}
                </motion.span>
                {i < words.length - 1 ? " " : ""}
              </Fragment>
            )
          })}
        </motion.h1>

        <motion.p
          {...fadeUp(1.0)}
          className="mx-auto mt-7 max-w-[600px] text-center text-[16px] leading-relaxed sm:text-[18px]"
          style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-body)" }}
        >
          Ask a question. Researca reads the relevant papers in full, ranks them by what
          actually matters, and draws them into one synthesis — where every claim links to its source.
        </motion.p>

        <motion.div {...fadeUp(1.25)} className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <StarButton label="Begin researching" />
          <StarButton label="Watch it work" href="#how" solid={false} />
        </motion.div>
      </motion.div>

      <motion.div style={{ opacity: cueOpacity }} className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 text-center">
        <p className="ms-label text-[10px] tracking-[0.3em]" style={{ color: "var(--text-muted)" }}>Scroll to observe</p>
        <motion.div
          aria-hidden
          animate={reduced ? undefined : { y: [0, 8, 0] }}
          transition={reduced ? undefined : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto mt-2 h-3 w-px"
          style={{ backgroundColor: "var(--border-strong)" }}
        />
      </motion.div>
    </section>
  )
}

// ── The constellation act — the heart of the page ─────────────────────────────
// One long pinned section. Scroll progress (p) drives, in sequence:
//   0.00–0.15  the question types itself
//   0.15–0.38  the four stars ignite at their sky positions, scores pop
//   0.38–0.55  the constellation lines draw between them
//   0.55–1.00  the lines/stars dim and the cited synthesis forms at centre
function ConstellationAct() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] })

  const [shownChars, setShownChars] = useState(0)
  const headingPhase = useTransform(p, [0, 0.4, 0.55, 1], [0, 0, 1, 1]) // 0=ranking,1=synthesis label

  // Query typing
  useEffect(() => {
    const unsub = p.on("change", (v) => {
      const t = clamp((v - 0.02) / (0.14 - 0.02), 0, 1)
      setShownChars(Math.round(t * QUERY.length))
    })
    return () => unsub()
  }, [p])

  const queryOpacity = useTransform(p, [0, 0.02, 0.5, 0.58], [0, 1, 1, 0])

  // Sky (stars + lines) fades out as the synthesis arrives.
  const skyOpacity = useTransform(p, [0.55, 0.66], [1, 0])
  const skyScale = useTransform(p, [0.55, 0.7], [1, 0.82])

  // Synthesis card materialises where the constellation was.
  const answerOpacity = useTransform(p, [0.6, 0.7], [0, 1])
  const answerY = useTransform(p, [0.6, 0.7], [24, 0])
  const footnoteOpacity = useTransform(p, [0.9, 1], [0, 1])
  const typing = shownChars < QUERY.length

  return (
    <section ref={ref} data-act={1} className="relative z-10" style={{ height: "560vh" }}>
      <div className="sticky top-0 flex h-screen w-full flex-col items-center justify-center overflow-hidden px-6">
        {/* The question */}
        <motion.div style={{ opacity: queryOpacity }} className="absolute top-[16vh] left-0 right-0 flex flex-col items-center px-6 text-center">
          <Eyebrow color={TEAL}>You ask</Eyebrow>
          <p className="mt-5 max-w-3xl text-2xl leading-snug sm:text-3xl md:text-4xl"
            style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontStyle: "italic", color: STAR }}>
            <span className="opacity-40">“</span>{QUERY.slice(0, shownChars)}
            {typing && <span className="ml-0.5 inline-block h-[0.85em] w-[2px] translate-y-[0.1em] animate-caret" style={{ backgroundColor: GOLD }} />}
            <span className="opacity-40">”</span>
          </p>
        </motion.div>

        {/* Crossfading stage label */}
        <div className="absolute top-[8vh] left-0 right-0 flex justify-center">
          <StageLabel phase={headingPhase} />
        </div>

        {/* The constellation stage */}
        <motion.div style={{ opacity: skyOpacity, scale: skyScale }} className="relative aspect-[4/3] w-full max-w-3xl">
          {/* SVG lines layer */}
          <svg viewBox="0 0 100 75" className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none">
            {EDGES.map(([a, b], i) => (
              <ConstellationEdge key={i} a={STARS[a]} b={STARS[b]} order={i} progress={p} />
            ))}
          </svg>
          {/* Stars */}
          {STARS.map((s, i) => (
            <StarNode key={s.n} star={s} rank={i} progress={p} />
          ))}
        </motion.div>

        {/* The synthesized answer */}
        <motion.div style={{ opacity: answerOpacity, y: answerY }} className="absolute left-1/2 top-1/2 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 px-6">
          <div className="relative rounded-[6px] border px-8 py-9 sm:px-10"
            style={{ backgroundColor: "rgba(21,26,38,0.85)", borderColor: "var(--border-soft)", backdropFilter: "blur(8px)", boxShadow: "0 30px 80px -30px rgba(0,0,0,0.8)" }}>
            <span aria-hidden className="absolute left-0 top-7 bottom-7 w-[3px] rounded-full glow-gold" style={{ backgroundColor: GOLD }} />
            <p className="text-[18px] leading-relaxed sm:text-[21px]" style={{ fontFamily: "var(--font-playfair), Georgia, serif", color: STAR }}>
              {SYNTHESIS.map((tok, i) => (
                <SynthWord key={i} token={tok} index={i} total={SYNTHESIS.length} progress={p} />
              ))}
            </p>
            <motion.div style={{ opacity: footnoteOpacity }} className="mt-8 space-y-1.5 border-t pt-5" >
              {STARS.map((s) => (
                <p key={s.n} className="text-[11px] leading-relaxed" style={{ fontFamily: "var(--font-pt-mono), monospace", color: "var(--text-secondary)" }}>
                  <span style={{ color: GOLD }}>[{s.n}]</span> {s.authors} · {s.title}. {s.venue}, {s.year}.
                </p>
              ))}
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function StageLabel({ phase }: { phase: MotionValue<number> }) {
  const rankOpacity = useTransform(phase, [0, 0.5], [1, 0])
  const synthOpacity = useTransform(phase, [0.5, 1], [0, 1])
  return (
    <div className="relative h-4 w-full">
      <motion.p style={{ opacity: rankOpacity }} className="ms-label absolute inset-0 text-center text-[11px] tracking-[0.35em]" >
        <span style={{ color: GOLD }}>Researca lights the papers that matter</span>
      </motion.p>
      <motion.p style={{ opacity: synthOpacity }} className="ms-label absolute inset-0 text-center text-[11px] tracking-[0.35em]">
        <span style={{ color: GOLD }}>And draws them into one cited answer</span>
      </motion.p>
    </div>
  )
}

function StarNode({ star, rank, progress }: { star: Star; rank: number; progress: MotionValue<number> }) {
  const i0 = 0.16 + rank * 0.035
  const opacity = useTransform(progress, [i0, i0 + 0.07], [0, 1])
  const scale = useTransform(progress, [i0, i0 + 0.07, i0 + 0.12], [0.2, 1.4, 1])
  // Score chip pops shortly after the star ignites.
  const sc0 = i0 + 0.1
  const scoreOpacity = useTransform(progress, [sc0, sc0 + 0.05, 0.55, 0.6], [0, 1, 1, 0])
  // Whole node dims slightly as lines draw so the lines read.
  return (
    <motion.div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${star.x}%`, top: `${star.y}%`, opacity }}
    >
      {/* glow + core */}
      <motion.div style={{ scale }} className="relative grid place-items-center">
        <span className="absolute size-10 rounded-full" style={{ background: `radial-gradient(circle, ${GOLD}55, transparent 70%)` }} />
        <span className="size-2.5 rounded-full glow-gold star-twinkle" style={{ backgroundColor: STAR }} />
      </motion.div>
      {/* label */}
      <motion.div style={{ opacity: scoreOpacity }} className="absolute left-1/2 top-4 w-44 -translate-x-1/2 text-center">
        <p className="text-[11px] font-bold tabular-nums" style={{ fontFamily: "var(--font-pt-mono), monospace", color: GOLD }}>{star.score}</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-body)" }}>{star.title}</p>
        <p className="mt-0.5 text-[9px]" style={{ fontFamily: "var(--font-pt-mono), monospace", color: "var(--text-muted)" }}>{star.authors} · {star.year}</p>
      </motion.div>
    </motion.div>
  )
}

function ConstellationEdge({ a, b, order, progress }: { a: Star; b: Star; order: number; progress: MotionValue<number> }) {
  const start = 0.4 + order * 0.035
  const pathLength = useTransform(progress, [start, start + 0.09], [0, 1])
  const opacity = useTransform(progress, [start, start + 0.05], [0, 1])
  return (
    <motion.line
      x1={a.x} y1={a.y * 0.75} x2={b.x} y2={b.y * 0.75}
      stroke={GOLD}
      strokeWidth={0.25}
      strokeLinecap="round"
      style={{ pathLength, opacity }}
      vectorEffect="non-scaling-stroke"
    />
  )
}

function SynthWord({ token, index, total, progress }: { token: Token; index: number; total: number; progress: MotionValue<number> }) {
  const start = 0.66 + (index / total) * 0.28
  const end = start + 0.035
  const opacity = useTransform(progress, [start, end], [0.12, 1])
  const y = useTransform(progress, [start, end], [6, 0])
  if (token.cite) {
    return (
      <motion.span style={{ opacity, y }} className="mx-1 inline-block translate-y-[-0.15em] align-super text-[0.5em] font-bold">
        <span className="rounded-[3px] px-1.5 py-0.5" style={{ backgroundColor: GOLD, color: "#0B0E14", fontFamily: "var(--font-pt-mono), monospace" }}>{token.t}</span>
      </motion.span>
    )
  }
  return <motion.span style={{ opacity, y }} className="mr-[0.28em] inline-block">{token.t}</motion.span>
}

// ── "How it works" rail — three quiet steps ───────────────────────────────────
const STEPS = [
  { k: "01", title: "Ask in plain language", body: "No boolean operators, no database syntax. Describe what you're trying to understand." },
  { k: "02", title: "Researca reads in full", body: "It pulls the relevant papers and reads the actual text — not just abstracts — ranking by true relevance." },
  { k: "03", title: "Get a cited synthesis", body: "One clear answer with every claim linked to its source. Open any paper and verify it yourself." },
]
function HowItWorks() {
  return (
    <section id="how" className="relative z-10 w-full px-6 py-28">
      <div className="mx-auto max-w-5xl">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.7, ease: EASE_OUT }} className="text-center">
          <Eyebrow color={TEAL}>The method</Eyebrow>
          <h2 className="mx-auto mt-4 max-w-2xl text-[clamp(28px,4vw,44px)] leading-[1.1] tracking-tight" style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontWeight: 600, color: STAR }}>
            From a question to a constellation.
          </h2>
        </motion.div>
        <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-3" style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--border-soft)" }}>
          {STEPS.map((s, i) => (
            <motion.div
              key={s.k}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: i * 0.12 }}
              className="p-8"
              style={{ backgroundColor: "var(--bg-secondary)" }}
            >
              <p className="text-[12px] tracking-[0.2em]" style={{ fontFamily: "var(--font-pt-mono), monospace", color: GOLD }}>{s.k}</p>
              <h3 className="mt-3 text-[20px]" style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontWeight: 600, color: STAR }}>{s.title}</h3>
              <p className="mt-2.5 text-[14.5px] leading-relaxed" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-body)" }}>{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Feature trio ──────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: "✦", title: "Relevance-ranked", body: "Papers ranked by what matters to your query — not how often they've been cited.", color: GOLD },
  { icon: "◇", title: "Cross-paper synthesis", body: "Finds where the literature agrees, disagrees, and goes silent — the analysis a researcher actually needs.", color: TEAL },
  { icon: "↗", title: "Verify in one click", body: "Every claim links to its exact source. No invented citations, ever.", color: GOLD },
]
function Features() {
  return (
    <section id="features" className="relative z-10 w-full px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.7, ease: EASE_OUT }} className="text-center">
          <Eyebrow>Why researchers trust it</Eyebrow>
          <h2 className="mx-auto mt-4 max-w-2xl text-[clamp(28px,4vw,44px)] leading-[1.1] tracking-tight" style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontWeight: 600, color: STAR }}>
            Built to be checked, not trusted blindly.
          </h2>
        </motion.div>
        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: i * 0.1 }}
              className="group rounded-2xl border p-7 transition-colors duration-300 hover:border-[var(--border-strong)]"
              style={{ backgroundColor: "rgba(21,26,38,0.5)", borderColor: "var(--border-soft)" }}
            >
              <span className="grid size-11 place-items-center rounded-full text-[18px] transition-transform duration-300 group-hover:-translate-y-0.5"
                style={{ color: f.color, border: `1px solid ${f.color}40`, boxShadow: `0 0 24px ${f.color}22` }}>
                {f.icon}
              </span>
              <h3 className="mt-5 text-[19px]" style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontWeight: 600, color: STAR }}>{f.title}</h3>
              <p className="mt-2.5 text-[14.5px] leading-relaxed" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-body)" }}>{f.body}</p>
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
function Tick({ color = GOLD }: { color?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="mt-[3px] size-3.5 shrink-0">
      <path d="M3 8.5l3 3 7-7.5" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function Pricing() {
  return (
    <section id="pricing" className="relative z-10 w-full scroll-mt-24 px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.7, ease: EASE_OUT }} className="mb-10 text-center">
          <Eyebrow>Simple, honest pricing</Eyebrow>
          <h2 className="mt-4 text-[clamp(26px,4vw,40px)] leading-[1.1] tracking-tight" style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontWeight: 600, color: STAR }}>
            Start free. Upgrade when it earns it.
          </h2>
        </motion.div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {TIERS.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: i * 0.1 }}
              className={`flex flex-col rounded-2xl p-8 ${t.featured ? "glow-gold" : ""}`}
              style={{
                backgroundColor: t.featured ? "rgba(212,175,55,0.06)" : "rgba(21,26,38,0.6)",
                border: t.featured ? `1.5px solid ${GOLD}` : "1px solid var(--border-soft)",
              }}
            >
              <div className="flex items-center gap-3">
                <h3 className="text-[26px]" style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontWeight: 600, color: STAR }}>{t.name}</h3>
                {t.featured && (
                  <span className="ms-label rounded-full px-2.5 py-0.5 text-[10px] tracking-[0.12em]" style={{ backgroundColor: "rgba(212,175,55,0.16)", color: GOLD }}>Popular</span>
                )}
              </div>
              <p className="mt-2" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-secondary)" }}>
                <span className="text-2xl font-semibold" style={{ color: STAR }}>{t.price}</span> {t.period}
              </p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {t.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2.5 text-[14px]" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-body)" }}>
                    <Tick color={t.featured ? GOLD : TEAL} />{pt}
                  </li>
                ))}
              </ul>
              <a href="/auth" className="mt-8 block rounded-full px-5 py-3 text-center text-[13px] font-semibold tracking-[0.02em] transition-transform duration-300 hover:-translate-y-0.5"
                style={{ backgroundColor: t.featured ? GOLD : "transparent", color: t.featured ? "#0B0E14" : STAR, border: t.featured ? "none" : "1px solid var(--border-strong)", fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
                {t.cta}
              </a>
            </motion.div>
          ))}
        </div>
        <p className="mt-7 text-center text-[13px]" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-secondary)" }}>
          Students &amp; researchers in developing countries —{" "}
          <a href="mailto:araadh3111@gmail.com" className="underline decoration-[var(--highlight)]/40 underline-offset-2 transition-colors hover:decoration-[var(--highlight)]" style={{ color: STAR }}>email for a discount</a>.
        </p>
      </div>
    </section>
  )
}

// ── Final CTA band ────────────────────────────────────────────────────────────
function FinalCta() {
  return (
    <section className="relative z-10 w-full px-6 py-28">
      <motion.div initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.7, ease: EASE_OUT }} className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <Eyebrow color={TEAL}>The telescope is ready</Eyebrow>
        <h2 className="mt-5 text-4xl leading-[1.08] tracking-tight sm:text-6xl" style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontWeight: 600, color: STAR }}>
          Point it at your question.
        </h2>
        <p className="mx-auto mt-5 max-w-md text-[16px] leading-relaxed" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-body)" }}>
          Your first literature review is thirty seconds away. No credit card.
        </p>
        <div className="mt-10"><StarButton label="Begin researching" /></div>
      </motion.div>
    </section>
  )
}

// ── Colophon footer ───────────────────────────────────────────────────────────
const FOOTER_COLS: { heading: string; links: { label: string; href: string; ext?: boolean }[] }[] = [
  { heading: "Product", links: [{ label: "How it works", href: "#how" }, { label: "Features", href: "#features" }, { label: "Pricing", href: "#pricing" }] },
  { heading: "Account", links: [{ label: "Sign in", href: "/auth" }, { label: "Start free", href: "/auth" }] },
  { heading: "Resources", links: [{ label: "GitHub", href: "https://github.com/Araadh3111/research-copilot", ext: true }, { label: "X / Twitter", href: "https://x.com/araadhsingh1", ext: true }] },
]
function Colophon() {
  return (
    <footer className="relative z-10 w-full px-6 pb-12 pt-16" style={{ borderTop: "1px solid var(--border-soft)" }}>
      <div className="mx-auto max-w-5xl">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 sm:gap-8">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2.5">
              <Logo size={26} />
              <span className="text-[20px]" style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontWeight: 600, color: STAR }}>Researca</span>
            </div>
            <p className="mt-3 max-w-[16rem] text-[13px] leading-relaxed" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-secondary)" }}>
              Read the night sky of science. Literature review in thirty seconds.
            </p>
          </div>
          {FOOTER_COLS.map((col) => (
            <div key={col.heading}>
              <p className="ms-label text-[11px] tracking-[0.22em]" style={{ color: GOLD }}>{col.heading}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} {...(l.ext ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="text-[13.5px] transition-colors hover:text-[var(--highlight)]" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "var(--text-body)" }}>{l.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 space-y-1.5 border-t pt-6" style={{ borderColor: "var(--border-soft)" }}>
          <p className="text-[12px]" style={{ fontFamily: "var(--font-pt-mono), monospace", color: "var(--text-secondary)" }}>Built by Araadh · Age 15 · Chandigarh, India</p>
          <p className="text-[13px] italic" style={{ fontFamily: "var(--font-playfair), Georgia, serif", color: STAR }}>Real papers. Real citations. Every claim linked to its source.</p>
        </div>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="ms-label text-[11px] tracking-[0.18em]" style={{ color: "var(--text-muted)" }}>An observatory for the literature</p>
          <p className="ms-label text-[11px] tracking-[0.18em]" style={{ color: "var(--text-muted)" }}>© 2026 Researca</p>
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

  // The Observatory is a night experience by design — its type/panels are all
  // starlight-on-ink. So force the dark theme for this page regardless of any
  // saved 'light' preference; otherwise white text lands on the pale Daybreak
  // sky and is invisible. (The toggle still governs the logged-in app.)
  useEffect(() => {
    const root = document.documentElement
    const hadDark = root.classList.contains("dark")
    root.classList.add("dark")
    return () => {
      // Restore the user's real preference when leaving the landing.
      if (!hadDark) {
        try {
          if (localStorage.getItem("theme") === "light") root.classList.remove("dark")
        } catch {
          /* storage blocked — leave as-is */
        }
      }
    }
  }, [])

  // Whole-page progress drives the 3D fly-through.
  const { scrollYProgress: pageProgress } = useScroll()

  return (
    <>
      <ReactLenis root options={{ lerp: 0.085, wheelMultiplier: 1, smoothWheel: true }} />
      <main className="relative bg-canvas">
        <ObservatoryNav />
        {/* Live 3D starfield (lazy, client-only). The CSS .bg-canvas sky sits
            beneath it as an instant, no-JS fallback. */}
        {mounted && <SkyField scrollProgress={pageProgress} />}

        {/* A couple of decorative shooting stars, staggered. */}
        {mounted && !reduced && (
          <div aria-hidden className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
            <span className="shooting-star" style={{ top: "18%", left: "-10%", animationDelay: "2s" }} />
            <span className="shooting-star" style={{ top: "52%", left: "-10%", animationDelay: "6.5s" }} />
          </div>
        )}

        <div className="relative z-10">
          <Hero reduced={reduced} />
          <ConstellationAct />
          <HowItWorks />
          <Features />
          <Pricing />
          <FinalCta />
          <Colophon />
        </div>
      </main>
    </>
  )
}
