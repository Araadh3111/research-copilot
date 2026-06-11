"use client"

/**
 * THE OBSERVATORY — Researca's landing (bold-editorial / brutalist).
 *
 * Shared chrome (masthead, footer, rules, buttons, ticker, palette) lives in
 * observatory-chrome.tsx so the landing and every sub-page are one publication.
 * Display type is Roboto set black + tight + uppercase for the brutalist punch;
 * a single Playfair serif moment is reserved for the synthesised "answer" — the
 * scholarship voice amid the grotesk furniture. Motion is restrained: line
 * reveals, scroll-drawn rules, a marquee ticker, magnetic buttons.
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
import {
  GOLD, STAR, INK, LINE, LINE_STRONG, EASE_OUT, DISPLAY, BODY, MONO,
  Mono, Rule, RuleDraw, CoverButton, Masthead, Colophon, SectionHead, Ticker, reveal, useForceDark,
} from "@/components/landing/observatory-chrome"

const SkyField = dynamic(
  () => import("@/components/landing/sky-field").then((m) => m.SkyField),
  { ssr: false },
)

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

const TICKER_TERMS = [
  "Genomics", "Machine learning", "Climate modeling", "Immunology", "Condensed matter",
  "Neuroscience", "Epidemiology", "Materials science", "NLP", "Astrophysics", "Proteomics", "Robotics",
]

// ── Hero ──────────────────────────────────────────────────────────────────────
const headlineContainer: Variants = { hidden: {}, show: { transition: { delayChildren: 0.15, staggerChildren: 0.09 } } }
const lineReveal: Variants = {
  hidden: { opacity: 0, y: "0.5em" },
  show: { opacity: 1, y: 0, transition: { duration: 0.75, ease: EASE_OUT } },
}
const HEAD_LINES = ["Literature", "review, in", "thirty seconds."]

function Hero() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] })
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0])
  const cueOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0])
  const fade = (delay: number) => ({
    initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.8, ease: EASE_OUT },
  })

  return (
    <section ref={ref} data-act={0} className="relative z-10 min-h-screen w-full pt-[57px]">
      <motion.div style={{ opacity }} className="mx-auto flex min-h-[calc(100vh-57px)] max-w-6xl flex-col px-6">
        <motion.div {...fade(0.05)} className="flex items-center justify-between py-6">
          <Mono className="text-[10px]" style={{ color: "var(--text-muted)" }}>Est. 2026 · Chandigarh</Mono>
          <Mono className="text-[10px]" style={{ color: "var(--text-muted)" }}>An observatory for the literature</Mono>
        </motion.div>
        <Rule strong />

        <div className="grid flex-1 grid-cols-1 items-center gap-12 py-12 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <motion.h1 variants={headlineContainer} initial="hidden" animate="show"
              className="text-[clamp(46px,9.5vw,128px)] font-black uppercase leading-[0.88] tracking-[-0.03em]"
              style={{ fontFamily: DISPLAY, color: STAR }}>
              {HEAD_LINES.map((line, i) => (
                <span key={i} className="block overflow-hidden">
                  <motion.span variants={lineReveal} className="block" style={i === 2 ? { color: GOLD } : undefined}>{line}</motion.span>
                </span>
              ))}
            </motion.h1>
            <motion.p {...fade(0.95)} className="mt-8 max-w-xl text-[16px] leading-relaxed sm:text-[17px]" style={{ fontFamily: BODY, color: "var(--text-body)" }}>
              Researca reads real academic papers in full, ranks them by what actually matters,
              and returns one synthesis — with every claim linked to its source.
            </motion.p>
            <motion.div {...fade(1.15)} className="mt-10 flex flex-wrap items-center gap-3">
              <CoverButton label="Begin researching" />
              <CoverButton label="Watch it work" href="#method" primary={false} />
            </motion.div>
          </div>

          <motion.div {...fade(0.7)} className="border-t pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0" style={{ borderColor: LINE }}>
            <Mono className="text-[10px]" style={{ color: "var(--text-muted)" }}>In this issue</Mono>
            <ol className="mt-5 space-y-4">
              {[["01", "Ask in plain language"], ["02", "Read the papers in full"], ["03", "Rank by real relevance"], ["04", "Return a cited answer"]].map(([n, t]) => (
                <li key={n} className="flex items-baseline gap-4">
                  <Mono className="text-[11px]" style={{ color: GOLD }}>{n}</Mono>
                  <span className="text-[15px]" style={{ fontFamily: BODY, color: STAR }}>{t}</span>
                </li>
              ))}
            </ol>
          </motion.div>
        </div>

        <Rule strong />
        <motion.div style={{ opacity: cueOpacity }} className="flex items-center justify-between py-5">
          <Mono className="text-[10px]" style={{ color: "var(--text-muted)" }}>Scroll to observe ↓</Mono>
          <Mono className="text-[10px]" style={{ color: "var(--text-muted)" }}>Fig. 01 — the ledger</Mono>
        </motion.div>
      </motion.div>
    </section>
  )
}

// ── Working demo — ledger that re-ranks → cited synthesis ─────────────────────
function DemoAct() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] })
  const [shownChars, setShownChars] = useState(0)
  useEffect(() => {
    const unsub = p.on("change", (v) => setShownChars(Math.round(clamp((v - 0.02) / (0.13 - 0.02), 0, 1) * QUERY.length)))
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
          <div className="flex items-baseline gap-4 pb-5">
            <Mono className="shrink-0 text-[10px]" style={{ color: GOLD }}>Query</Mono>
            <p className="text-[18px] leading-snug sm:text-[22px]" style={{ fontFamily: "var(--font-serif), Georgia, serif", fontStyle: "italic", color: STAR }}>
              {QUERY.slice(0, shownChars)}
              {typing && <span className="ml-0.5 inline-block h-[0.85em] w-[2px] translate-y-[0.1em] animate-caret" style={{ backgroundColor: GOLD }} />}
            </p>
          </div>
          <Rule strong />
          <div className="py-4"><DemoLabel phase={labelPhase} /></div>

          <div className="relative" style={{ minHeight: ROW_PITCH * PAPERS.length + 10 }}>
            <motion.div style={{ opacity: ledgerOpacity, y: ledgerY }} className="absolute inset-0">
              {PAPERS.map((paper, i) => <LedgerRow key={paper.n} paper={paper} rank={i} fromSlot={SCRAMBLE[i]} progress={p} />)}
            </motion.div>
            <motion.div style={{ opacity: answerOpacity, y: answerY }} className="absolute inset-0 flex items-start">
              <div className="w-full border-l-2 pl-6" style={{ borderColor: GOLD }}>
                <p className="text-[19px] leading-relaxed sm:text-[23px]" style={{ fontFamily: "var(--font-serif), Georgia, serif", color: STAR }}>
                  {SYNTHESIS.map((tok, i) => <SynthWord key={i} token={tok} index={i} total={SYNTHESIS.length} progress={p} />)}
                </p>
                <motion.div style={{ opacity: footOpacity, borderColor: LINE }} className="mt-7 border-t pt-5">
                  <div className="space-y-1.5">
                    {PAPERS.map((pp) => (
                      <p key={pp.n} className="text-[11px] leading-relaxed" style={{ fontFamily: MONO, color: "var(--text-secondary)" }}>
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
      <motion.div style={{ opacity: a }} className="absolute inset-0"><Mono className="text-[11px]" style={{ color: "var(--text-muted)" }}>Reading 24 papers in full · ranking by relevance</Mono></motion.div>
      <motion.div style={{ opacity: b }} className="absolute inset-0"><Mono className="text-[11px]" style={{ color: "var(--text-muted)" }}>One synthesis · every claim cited</Mono></motion.div>
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
        <motion.span style={{ opacity: ordinalOpacity }} className="w-6 shrink-0"><Mono className="text-[13px] tabular-nums" style={{ color: "var(--text-muted)" }}>{String(rank + 1).padStart(2, "0")}</Mono></motion.span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold sm:text-[17px]" style={{ fontFamily: BODY, color: STAR }}>{paper.title}</p>
          <p className="mt-0.5 text-[11px]" style={{ fontFamily: MONO, color: "var(--text-muted)" }}>{paper.authors} · {paper.venue} · {paper.year}</p>
        </div>
        <motion.div style={{ opacity: scoreOpacity }} className="shrink-0 text-right">
          <span className="text-[22px] font-black tabular-nums leading-none" style={{ fontFamily: DISPLAY, color: GOLD }}>{paper.score}</span>
          <Mono className="ml-1 text-[9px]" style={{ color: "var(--text-muted)" }}>rel</Mono>
        </motion.div>
      </div>
    </motion.div>
  )
}

function SynthWord({ token, index, total, progress }: { token: Token; index: number; total: number; progress: MotionValue<number> }) {
  const start = 0.66 + (index / total) * 0.26
  const opacity = useTransform(progress, [start, start + 0.03], [0.14, 1])
  if (token.cite) {
    return (
      <motion.span style={{ opacity }} className="mx-0.5 inline-block translate-y-[-0.12em] align-super text-[0.5em] font-bold">
        <span className="px-1 py-0.5" style={{ backgroundColor: GOLD, color: INK, fontFamily: MONO }}>{token.t}</span>
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
function Method() {
  return (
    <section id="method" className="relative z-10 w-full scroll-mt-16 pt-20">
      <SectionHead num="§ 01" label="The method" title={<>From a question to a <span style={{ color: GOLD }}>cited answer.</span></>} />
      <div className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid grid-cols-1 border-t sm:grid-cols-3" style={{ borderColor: LINE_STRONG }}>
          {STEPS.map((s, i) => (
            <motion.div key={s.k} {...reveal} transition={{ ...reveal.transition, delay: i * 0.1 }}
              className="border-b px-2 py-8 sm:border-b-0 sm:px-7 sm:[&:not(:first-child)]:border-l" style={{ borderColor: LINE }}>
              <Mono className="text-[11px]" style={{ color: GOLD }}>{s.k}</Mono>
              <h3 className="mt-4 text-[21px] font-bold" style={{ fontFamily: DISPLAY, color: STAR }}>{s.title}</h3>
              <p className="mt-3 text-[14.5px] leading-relaxed" style={{ fontFamily: BODY, color: "var(--text-body)" }}>{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Why ───────────────────────────────────────────────────────────────────────
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
            <motion.div key={f.k} {...reveal} transition={{ ...reveal.transition, delay: i * 0.1 }} className="px-7 py-9" style={{ backgroundColor: INK }}>
              <div className="flex h-9 w-9 items-center justify-center" style={{ border: `1px solid ${GOLD}` }}>
                <Mono className="text-[13px]" style={{ color: GOLD, letterSpacing: 0 }}>{f.k}</Mono>
              </div>
              <h3 className="mt-5 text-[20px] font-bold" style={{ fontFamily: DISPLAY, color: STAR }}>{f.title}</h3>
              <p className="mt-3 text-[14.5px] leading-relaxed" style={{ fontFamily: BODY, color: "var(--text-body)" }}>{f.body}</p>
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
              className="flex flex-col p-8" style={{ borderLeft: i === 1 ? `1px solid ${LINE_STRONG}` : undefined, backgroundColor: t.featured ? "rgba(212,175,55,0.05)" : "transparent" }}>
              <div className="flex items-baseline justify-between">
                <h3 className="text-[28px] font-bold" style={{ fontFamily: DISPLAY, color: STAR }}>{t.name}</h3>
                {t.featured && <Mono className="px-2 py-0.5 text-[10px]" style={{ color: INK, backgroundColor: GOLD }}>Popular</Mono>}
              </div>
              <p className="mt-3" style={{ fontFamily: BODY, color: "var(--text-secondary)" }}>
                <span className="text-3xl font-bold" style={{ color: STAR, fontFamily: DISPLAY }}>{t.price}</span>{" "}
                <Mono className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t.period}</Mono>
              </p>
              <ul className="mt-7 flex-1 space-y-3">
                {t.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-3 text-[14px]" style={{ fontFamily: BODY, color: "var(--text-body)" }}>
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0" style={{ backgroundColor: GOLD }} />{pt}
                  </li>
                ))}
              </ul>
              <div className="mt-8"><CoverButton label={t.cta} primary={t.featured} /></div>
            </motion.div>
          ))}
        </div>
        <p className="mt-6 text-[13px]" style={{ fontFamily: BODY, color: "var(--text-secondary)" }}>
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
        <RuleDraw strong />
        <motion.div {...reveal} className="flex flex-col items-start gap-8 py-20 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="max-w-2xl text-[clamp(34px,6vw,80px)] font-black uppercase leading-[0.9] tracking-[-0.03em]" style={{ fontFamily: DISPLAY, color: STAR }}>
            Point it at your<br /><span style={{ color: GOLD }}>question.</span>
          </h2>
          <div className="shrink-0">
            <p className="mb-5 max-w-xs text-[14px] leading-relaxed" style={{ fontFamily: BODY, color: "var(--text-body)" }}>
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

// ── Page ────────────────────────────────────────────────────────────────────
export function ObservatoryLanding() {
  const prefersReduced = useReducedMotion()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const reduced = mounted && !!prefersReduced
  useForceDark()
  const { scrollYProgress: pageProgress } = useScroll()

  return (
    <>
      <ReactLenis root options={{ lerp: 0.09, wheelMultiplier: 1, smoothWheel: true }} />
      <main className="relative bg-canvas">
        <Masthead />
        {mounted && !reduced && <SkyField scrollProgress={pageProgress} />}
        <div className="relative z-10">
          <Hero />
          <Ticker items={TICKER_TERMS} />
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
