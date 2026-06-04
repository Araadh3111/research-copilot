"use client"

import { Fragment, useEffect, useRef, useState } from "react"
import {
  motion,
  useInView,
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion,
  MotionConfig,
  type Variants,
} from "motion/react"
import { Target, GitMerge, ShieldCheck, ArrowRight, ChevronDown, Check, X } from "lucide-react"
import { Logo } from "@/components/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { Magnetic } from "@/components/magnetic"

// ── Shared motion vocabulary ──────────────────────────────────────────────────
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

// Section content: fade + slide up when it scrolls into view (once).
const reveal: Variants = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
}

// Plain fade for small supporting text.
const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.6, ease: EASE } },
}

// Stagger container: children (which use `reveal`) come in 0.1s apart.
const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
}

const VIEWPORT_ONCE = { once: true, amount: 0.2 } as const

// ── Hardcoded demo data (static — looks exactly like real Researca output) ────
const DEMO_ROWS = [
  {
    title: "CRISPR-Cas9 enables precise genome editing",
    year: 2023,
    methodology: "In vivo mouse model, n = 47",
    finding: "94% on-target efficiency achieved",
    gap: "Long-term immune response unstudied",
  },
  {
    title: "Off-target effects in therapeutic CRISPR",
    year: 2023,
    methodology: "Whole genome sequencing, 12 cell lines",
    finding: "3.2% off-target rate in non-dividing cells",
    gap: "Clinical trial data absent",
  },
  {
    title: "Base editing vs prime editing comparison",
    year: 2022,
    methodology: "Systematic review, 34 studies",
    finding: "Prime editing superior for point mutations",
    gap: "No head-to-head RCT exists",
  },
  {
    title: "CRISPR delivery mechanisms: viral vs non-viral",
    year: 2023,
    methodology: "Meta-analysis, 28 trials",
    finding: "LNP delivery matches AAV efficiency",
    gap: "Long-term expression data lacking",
  },
]

const FEATURES = [
  {
    icon: Target,
    title: "Relevance-ranked",
    body: "Papers ranked by what matters to your query, not how often they've been cited.",
  },
  {
    icon: GitMerge,
    title: "Cross-paper synthesis",
    body: "Finds contradictions and gaps across the full set — the analysis a researcher actually needs.",
  },
  {
    icon: ShieldCheck,
    title: "Zero hallucinations",
    body: "Every claim links to the actual paper. No invented citations, ever.",
  },
]

/** One animated stat: the number counts up from 0 when scrolled into view. */
function Stat({ end, suffix = "", prefix = "", label }: { end: number; suffix?: string; prefix?: string; label: string }) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const reduce = useReducedMotion()
  const count = useMotionValue(0)
  const display = useTransform(count, (v) => `${prefix}${Math.round(v)}${suffix}`)

  useEffect(() => {
    if (!inView) return
    if (reduce) {
      count.set(end)
      return
    }
    // easeOutExpo-ish settle for a snappy, premium count.
    const controls = animate(count, end, { duration: 1.4, ease: [0.16, 1, 0.3, 1] })
    return () => controls.stop()
  }, [inView, end, reduce, count])

  return (
    <div className="text-center">
      <div className="font-serif text-[34px] font-bold leading-none tracking-tight text-ink sm:text-[42px]">
        <motion.span ref={ref}>{display}</motion.span>
      </div>
      <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone">{label}</div>
    </div>
  )
}

/** Headline words that rise in sequence on load (0.08s between words, y:20 → 0).
 *  The inter-word spaces are real text nodes BETWEEN the inline-block spans so
 *  the line can still wrap; the two `block` spans keep the original line break. */
function Headline() {
  const lines = [
    ["Literature", "review,"],
    ["done", "in", "30", "seconds."],
  ]
  let wordIndex = 0
  return (
    <h1 className="font-serif text-[clamp(31px,8vw,72px)] font-bold leading-[1.05] tracking-[-0.02em] text-ink">
      {lines.map((words, li) => (
        <span key={li} className="block">
          {words.map((w, wi) => {
            const delay = 0.15 + wordIndex * 0.08
            wordIndex += 1
            return (
              <Fragment key={wi}>
                <motion.span
                  className="inline-block"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay, ease: EASE }}
                >
                  {w}
                </motion.span>
                {wi < words.length - 1 ? " " : ""}
              </Fragment>
            )
          })}
        </span>
      ))}
    </h1>
  )
}

/** The demo's matrix + synthesis snippet — reused inline and in fullscreen. */
function DemoBody() {
  return (
    <div className="p-5 sm:p-7">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-lg font-semibold text-ink">Comparison Matrix</h3>
        <span className="font-mono text-[11px] text-stone-light">query: &ldquo;CRISPR gene editing&rdquo;</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr>
              {["Paper", "Methodology", "Key Finding", "Gap"].map((h) => (
                <th
                  key={h}
                  className="border-b border-line bg-paper px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-stone"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEMO_ROWS.map((row, i) => (
              <tr key={i} className={`border-b border-line last:border-0 ${i % 2 === 1 ? "bg-paper/50" : ""}`}>
                <td className="px-4 py-4 align-top">
                  <span className="font-mono text-[12px] font-medium leading-snug text-ink">{row.title}</span>
                  <span className="mt-1 block font-mono text-[11px] text-stone-light">{row.year}</span>
                </td>
                <td className="px-4 py-4 align-top text-[13px] leading-relaxed text-stone">{row.methodology}</td>
                <td className="px-4 py-4 align-top text-[13px] leading-relaxed text-body">{row.finding}</td>
                <td className="px-4 py-4 align-top text-[13px] leading-relaxed text-stone">{row.gap}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Synthesis snippet */}
      <div className="mt-5 rounded-xl border border-gold/30 bg-gold/[0.06] p-5">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gold">Synthesis</p>
        <p className="text-[14px] leading-relaxed text-body">
          Papers 2 and 3 directly contradict on efficiency metrics. No study in this set
          addresses long-term immune response — this represents a critical gap in the literature.
        </p>
      </div>
    </div>
  )
}

export function LandingPage() {
  // Interactive demo browser-chrome state.
  const [demoMin, setDemoMin] = useState(false)
  const [demoFull, setDemoFull] = useState(false)
  const [wipe, setWipe] = useState(false)
  const [wipeOrigin, setWipeOrigin] = useState({ x: 0, y: 0 })

  return (
    // reducedMotion="user" honours prefers-reduced-motion across every animation below.
    <MotionConfig reducedMotion="user">
    <div className="overflow-x-hidden bg-paper">
      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-line bg-paper/80 backdrop-blur-sm">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <a href="/" className="flex items-center gap-2.5">
            <Logo size={32} />
            <span className="font-serif text-lg font-semibold tracking-tight text-ink sm:text-xl">Researca</span>
          </a>
          <div className="flex items-center gap-4 sm:gap-5">
            <ThemeToggle />
            <a href="/auth" className="text-sm text-stone transition-colors hover:text-ink">
              Sign in
            </a>
            <a
              href="/auth"
              className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-cream transition-all hover:bg-ink-soft sm:px-5"
            >
              Start for free
            </a>
          </div>
        </nav>
      </header>

      {/* ── Section 1: Hero ── */}
      <section className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center overflow-hidden px-6 py-24 text-center">
        <div aria-hidden className="grid-texture pointer-events-none absolute inset-0" />
        <div aria-hidden className="hero-grain pointer-events-none absolute inset-0" />
        <div aria-hidden className="aurora pointer-events-none absolute left-1/2 top-[42%] h-[460px] w-[680px] -translate-x-1/2 -translate-y-1/2" />

        <div className="relative mx-auto max-w-3xl">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="mb-6 text-[10px] font-semibold uppercase tracking-[0.08em] text-gold sm:text-[12px] sm:tracking-[0.16em]"
          >
            Built by Araadh · Age 15 · Chandigarh, India
          </motion.p>

          <Headline />

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6, ease: EASE }}
            className="mx-auto mt-7 max-w-[520px] text-[16px] leading-relaxed text-stone sm:text-[20px]"
          >
            Researca reads 20+ academic papers, ranks them by actual relevance, and synthesizes
            findings with real citations — not hallucinations.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.72, ease: EASE }}
            className="mt-9 flex flex-col items-center gap-3"
          >
            <Magnetic strength={0.5}>
              <a
                href="/auth"
                className="group inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-[15px] font-medium text-cream shadow-[0_10px_30px_-10px_rgba(26,23,20,0.5)] transition-colors duration-200 hover:bg-ink-soft"
              >
                Start researching free
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            </Magnetic>
            <p className="text-[13px] text-stone-light">No credit card · 10 free searches</p>
          </motion.div>

          {/* Trust stats — count up when the hero settles into view. */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.85, ease: EASE }}
            className="mt-14 flex items-center justify-center gap-10 sm:gap-16"
          >
            <Stat end={20} suffix="+" label="Papers / search" />
            <span aria-hidden className="h-10 w-px bg-line-strong" />
            <Stat end={30} suffix="s" label="To synthesis" />
            <span aria-hidden className="h-10 w-px bg-line-strong" />
            <Stat end={0} label="Hallucinations" />
          </motion.div>
        </div>

        <a
          href="#demo"
          aria-label="Scroll to demo"
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-stone-light transition-colors hover:text-ink"
        >
          <ChevronDown className="animate-scroll-bounce size-6" />
        </a>
      </section>

      {/* ── Section 2: Live demo ── */}
      <section id="demo" className="bg-cream px-6 py-[120px]">
        <motion.div
          className="mx-auto max-w-5xl"
          variants={reveal}
          initial="hidden"
          whileInView="show"
          viewport={VIEWPORT_ONCE}
        >
          <div className="mb-14 text-center">
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-gold">See it work</p>
            <h2 className="font-serif text-[clamp(26px,4vw,40px)] font-semibold tracking-tight text-ink">
              One query. Twenty papers. One synthesis.
            </h2>
          </div>

          <div className="overflow-hidden rounded-2xl border border-line-strong bg-cream shadow-[0_24px_60px_-24px_rgba(26,23,20,0.25)]">
            {/* Browser chrome — the three dots are interactive */}
            <div className="flex items-center gap-2 border-b border-line bg-paper px-4 py-3">
              <div className="group/chrome flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Close demo"
                  onClick={(e) => {
                    setWipeOrigin({ x: e.clientX, y: e.clientY })
                    setWipe(true)
                  }}
                  className="flex size-3 items-center justify-center rounded-full bg-[#E0584F] text-[8px] font-bold leading-none text-[#6e1c16] transition hover:brightness-95"
                >
                  <span className="opacity-0 transition-opacity group-hover/chrome:opacity-100">×</span>
                </button>
                <button
                  type="button"
                  aria-label={demoMin ? "Restore demo" : "Minimise demo"}
                  onClick={() => setDemoMin((m) => !m)}
                  className="flex size-3 items-center justify-center rounded-full bg-[#E6B04A] text-[10px] font-bold leading-none text-[#6e5310] transition hover:brightness-95"
                >
                  <span className="opacity-0 transition-opacity group-hover/chrome:opacity-100">−</span>
                </button>
                <button
                  type="button"
                  aria-label="Expand demo to fullscreen"
                  onClick={() => setDemoFull(true)}
                  className="flex size-3 items-center justify-center rounded-full bg-[#69A85C] text-[7px] font-bold leading-none text-[#1f461a] transition hover:brightness-95"
                >
                  <span className="opacity-0 transition-opacity group-hover/chrome:opacity-100">□</span>
                </button>
              </div>
              <div className="ml-3 flex-1">
                <div className="mx-auto w-full max-w-sm rounded-md border border-line bg-cream px-3 py-1 text-center font-mono text-[11px] text-stone">
                  researca.app/search
                </div>
              </div>
            </div>

            {/* Collapsible body — the yellow dot minimises this (height 0, 400ms) */}
            <div
              className={`grid transition-all duration-[400ms] ease-in-out ${
                demoMin ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
              }`}
            >
              <div className="overflow-hidden">
                <DemoBody />
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── Section 3: Features ── */}
      <section className="bg-parchment px-6 py-[120px]">
        <div className="mx-auto max-w-5xl">
          <motion.div
            className="grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8"
            variants={staggerParent}
            initial="hidden"
            whileInView="show"
            viewport={VIEWPORT_ONCE}
          >
            {FEATURES.map((f) => (
              <motion.div key={f.title} variants={reveal}>
                <span className="inline-flex size-11 items-center justify-center rounded-xl border border-line-strong bg-cream text-ink">
                  <f.icon className="size-5" strokeWidth={1.6} />
                </span>
                <h3 className="mt-5 font-serif text-2xl font-semibold text-ink">{f.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-stone">{f.body}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Section 4: Founder ── */}
      <section className="bg-paper px-6 py-[140px] sm:py-[160px]">
        <motion.div
          className="mx-auto max-w-2xl text-center"
          variants={reveal}
          initial="hidden"
          whileInView="show"
          viewport={VIEWPORT_ONCE}
        >
          <div className="font-serif text-[120px] leading-[0.5] text-gold" aria-hidden>
            &ldquo;
          </div>
          <blockquote className="mt-8 font-serif text-[22px] font-medium italic leading-[1.45] text-ink sm:text-[28px]">
            I was writing a research paper on prosthetic arms at 15. Every tool either hallucinated
            citations or made me read 30 papers manually. So I built the one I needed.
          </blockquote>
          <p className="mt-8 text-sm font-medium uppercase tracking-[0.08em] text-stone">
            — Araadh Singh, Founder &amp; Builder
          </p>
        </motion.div>
      </section>

      {/* ── Section 5: Pricing ── */}
      <section className="bg-cream px-6 py-[120px]">
        <div className="mx-auto max-w-3xl">
          <motion.div
            className="mb-14 text-center"
            variants={reveal}
            initial="hidden"
            whileInView="show"
            viewport={VIEWPORT_ONCE}
          >
            <h2 className="font-serif text-[clamp(26px,4vw,40px)] font-semibold tracking-tight text-ink">
              Simple, honest pricing
            </h2>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 gap-6 md:grid-cols-2"
            variants={staggerParent}
            initial="hidden"
            whileInView="show"
            viewport={VIEWPORT_ONCE}
          >
            {/* Free */}
            <motion.div variants={reveal} className="flex flex-col rounded-2xl border border-line bg-cream p-8 sm:p-10">
              <h3 className="font-serif text-[32px] font-semibold text-ink">Free</h3>
              <p className="mt-2 text-stone">
                <span className="text-2xl font-semibold text-ink">$0</span> / month
              </p>
              <ul className="mt-7 space-y-3">
                {["10 searches / month", "Synthesis mode"].map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-[15px] text-body">
                    <Check className="size-4 shrink-0 text-gold" strokeWidth={2.5} />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="/auth"
                className="mt-9 block rounded-full bg-ink px-5 py-3 text-center text-sm font-medium text-cream transition-colors hover:bg-ink-soft"
              >
                Start for free
              </a>
            </motion.div>

            {/* Pro */}
            <motion.div variants={reveal} className="flex flex-col rounded-2xl border-2 border-gold bg-gold/[0.05] p-8 sm:p-10">
              <div className="flex items-center gap-3">
                <h3 className="font-serif text-[32px] font-semibold text-ink">Pro</h3>
                <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-gold">
                  Popular
                </span>
              </div>
              <p className="mt-2 text-stone">
                <span className="text-2xl font-semibold text-ink">$29</span> / month
              </p>
              <ul className="mt-7 space-y-3">
                {[
                  "200 searches / month",
                  "Comparison matrix",
                  "Everything in Free",
                  "Priority synthesis (Sonnet model)",
                  "CSV + BibTeX export",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-[15px] text-body">
                    <Check className="size-4 shrink-0 text-gold" strokeWidth={2.5} />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="/auth"
                className="mt-9 block rounded-full bg-ink px-5 py-3 text-center text-sm font-medium text-cream transition-colors hover:bg-ink-soft"
              >
                Start Pro trial
              </a>
            </motion.div>
          </motion.div>

          <motion.p
            className="mt-8 text-center text-sm text-stone"
            variants={fadeIn}
            initial="hidden"
            whileInView="show"
            viewport={VIEWPORT_ONCE}
          >
            Students and researchers in developing countries —{" "}
            <a
              href="mailto:araadh3111@gmail.com"
              className="text-ink underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
            >
              email araadh3111@gmail.com
            </a>{" "}
            for a discount.
          </motion.p>
        </div>
      </section>

      {/* ── Footer (dark) ── */}
      <footer className="bg-ink px-6 py-12 dark:bg-[#0E0B07] dark:border-t dark:border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <span className="font-serif text-xl font-semibold text-cream dark:text-gold">Researca</span>
          <nav className="flex items-center gap-6 text-sm text-stone-light">
            <a href="#" className="transition-colors hover:text-cream dark:hover:text-gold">Privacy</a>
            <a href="mailto:araadh3111@gmail.com" className="transition-colors hover:text-cream dark:hover:text-gold">Contact</a>
            <a
              href="https://github.com/Araadh3111/research-copilot"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-cream dark:hover:text-gold"
            >
              GitHub
            </a>
          </nav>
          <p className="text-sm text-stone-light">
            Made with obsession by a 15-year-old. Chandigarh, India 🇮🇳
          </p>
        </div>
      </footer>

      {/* Green dot → fullscreen overlay showing the full matrix. */}
      {demoFull && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[55] overflow-auto bg-paper/95 p-4 backdrop-blur-sm sm:p-8"
        >
          <button
            type="button"
            aria-label="Close fullscreen"
            onClick={() => setDemoFull(false)}
            className="fixed right-5 top-5 z-10 inline-flex size-10 items-center justify-center rounded-full border border-line bg-cream text-stone shadow-sm transition-colors hover:border-line-strong hover:text-ink"
          >
            <X className="size-5" />
          </button>
          <div className="mx-auto mt-8 w-full max-w-5xl overflow-hidden rounded-2xl border border-line-strong bg-cream shadow-2xl">
            <DemoBody />
          </div>
        </div>
      )}

      {/* Red dot → fluid ink wipe expanding from the click; click again to reopen. */}
      <div
        onClick={() => setWipe(false)}
        aria-hidden={!wipe}
        className="fixed inset-0 z-[70] flex items-center justify-center"
        style={{
          background: "#1A1714",
          clipPath: `circle(${wipe ? 150 : 0}% at ${wipeOrigin.x}px ${wipeOrigin.y}px)`,
          transition: "clip-path 700ms cubic-bezier(0.76, 0, 0.24, 1)",
          pointerEvents: wipe ? "auto" : "none",
        }}
      >
        <p
          className="font-serif text-lg text-[#F5F0E8]/80 transition-opacity duration-500"
          style={{ opacity: wipe ? 1 : 0 }}
        >
          Click anywhere to reopen
        </p>
      </div>
    </div>
    </MotionConfig>
  )
}
