"use client"

import { ReactLenis } from "lenis/react"
import { motion, useReducedMotion, type Variants } from "motion/react"
import { useEffect, useState } from "react"
import { FallingBooksNav } from "@/components/falling-books-nav"

/**
 * DeskLanding — "The Research Desk".
 *
 * A command-center landing in the spirit of a founder's terminal/dashboard
 * (think indieterminal.com), re-imagined in Researca's Living Manuscript
 * identity: instead of a green-on-black dev terminal it's a scholar's writing
 * desk — a wax-sealed console, a ribbon of capabilities, a numbered method
 * (01–09), the modules behind the work, and live "sample output" slips you'd
 * actually get back. Light parchment, Playfair headings, PT-Mono labels, gold
 * used sparingly — all inherited from the global tokens in app/globals.css.
 *
 * Lives at /desk, alongside the other landing experiments (/galaxy, /classic),
 * while the scrollytelling "Living Manuscript" hero owns /.
 */

const EASE_OUT = [0.22, 1, 0.36, 1] as const

// A shared in-view reveal — quiet, runs once, used for every block below.
const REVEAL: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_OUT } },
}
const inView = {
  variants: REVEAL,
  initial: "hidden" as const,
  whileInView: "show" as const,
  viewport: { once: true, margin: "-80px" },
}

// ── Shared bits ───────────────────────────────────────────────────────────────
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="ms-label text-[11px] tracking-[0.35em] text-gold">{children}</p>
  )
}

function WaxButton({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      className="group inline-flex items-center gap-3 rounded-full bg-ink px-8 py-3.5 text-[14px] font-medium tracking-[0.02em] text-cream transition-transform duration-300 hover:-translate-y-0.5"
      style={{
        boxShadow:
          "0 14px 30px -12px rgba(26,23,20,0.6), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -2px 4px rgba(0,0,0,0.35)",
      }}
    >
      <span
        aria-hidden
        className="grid h-5 w-5 place-items-center rounded-full text-[9px] text-ink transition-transform duration-300 group-hover:rotate-12"
        style={{
          backgroundColor: "var(--highlight)",
          boxShadow: "inset 0 1px 1px rgba(255,255,255,0.4), inset 0 -1px 1px rgba(0,0,0,0.3)",
        }}
      >
        ✦
      </span>
      {label}
    </a>
  )
}

// ── Capability ribbon ───────────────────────────────────────────────────────
// indieterminal runs a scrolling marquee of product features; ours is a desk
// "ledger tape" of research capabilities, scrolling forever. Two copies sit in a
// row and the track slides exactly one copy-width, so the loop is seamless.
const CAPABILITIES = [
  "Relevance engine",
  "Full-text reading",
  "Cross-paper synthesis",
  "Citation ledger",
  "Comparison matrix",
  "Contradiction finder",
  "BibTeX + CSV export",
  "Gap detection",
  "Verbatim quotes",
]

function CapabilityRibbon({ animate }: { animate: boolean }) {
  const run = [...CAPABILITIES, ...CAPABILITIES]
  return (
    <div
      className="relative z-10 w-full overflow-hidden border-y border-line/70 bg-cream/40 py-3 backdrop-blur-sm"
      aria-hidden
    >
      <motion.div
        className="flex w-max items-center gap-8"
        animate={animate ? { x: ["0%", "-50%"] } : undefined}
        transition={animate ? { duration: 32, repeat: Infinity, ease: "linear" } : undefined}
      >
        {run.map((c, i) => (
          <span key={i} className="flex items-center gap-8 whitespace-nowrap">
            <span className="ms-label text-[12px] tracking-[0.18em] text-stone">{c}</span>
            <span className="text-gold/60">✦</span>
          </span>
        ))}
      </motion.div>
    </div>
  )
}

// ── Hero — the desk console ─────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative z-10 mx-auto max-w-5xl px-6 pt-20 pb-12 sm:pt-28">
      <motion.div {...inView} className="max-w-3xl">
        <Eyebrow>The Research Desk</Eyebrow>
        <h1
          className="mt-5 font-serif text-[clamp(40px,6.5vw,76px)] font-semibold leading-[1.04] tracking-tight text-ink"
        >
          A command center for serious research.
        </h1>
        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-body sm:text-[18px]">
          Pose the question. Researca reads the literature in full, ranks it by
          relevance, and hands back a cited synthesis — not a hallucination.
          One desk for the whole review.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-4">
          <WaxButton label="Open the desk" href="/auth" />
          <a
            href="/"
            className="text-[14px] font-medium text-ink underline decoration-gold/40 underline-offset-4 transition-colors hover:decoration-gold"
          >
            Watch it work →
          </a>
        </div>
      </motion.div>

      {/* The desk console — a wax-sealed "terminal" slip showing one command. */}
      <motion.div {...inView} className="mt-14">
        <Console />
      </motion.div>
    </section>
  )
}

function Console() {
  // Wax dots stand in for a terminal's traffic lights — manuscript, not macOS.
  const dots = ["var(--highlight)", "rgba(26,23,20,0.35)", "rgba(26,23,20,0.18)"]
  return (
    <div
      className="overflow-hidden rounded-[12px] border border-line bg-cream"
      style={{ boxShadow: "var(--shadow-paper-lg)" }}
    >
      {/* Title bar */}
      <div className="flex items-center gap-3 border-b border-line/80 bg-parchment/60 px-4 py-3">
        <div className="flex items-center gap-1.5">
          {dots.map((d, i) => (
            <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d }} />
          ))}
        </div>
        <span className="ms-label text-[10px] tracking-[0.2em] text-stone-light">
          researca — review session
        </span>
        <span className="ms-label ml-auto flex items-center gap-1.5 text-[10px] tracking-[0.2em] text-gold">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
          LIVE
        </span>
      </div>

      {/* Command body */}
      <div className="space-y-2 px-5 py-5 font-mono text-[13px] leading-relaxed sm:text-[14px]">
        <p className="text-stone">
          <span className="text-gold">researca ›</span> review{" "}
          <span className="text-ink">&quot;CRISPR off-target effects in human cells&quot;</span>
          <span className="ml-0.5 inline-block h-[1em] w-[7px] translate-y-[2px] animate-caret bg-ink align-middle" />
        </p>
        <p className="text-stone-light">
          <span className="text-gold/70">⎇</span> chapter/synthesis · reading{" "}
          <span className="text-ink">24 papers</span> in full…
        </p>
        <div className="pt-1.5 text-stone-light">
          <p>
            <span className="text-gold">✓</span> ranked 24 → top 4 by relevance
          </p>
          <p>
            <span className="text-gold">✓</span> extracted 11 findings, 0 invented citations
          </p>
          <p>
            <span className="text-gold">✓</span> synthesized answer ready{" "}
            <span className="text-ink">(28s)</span>
          </p>
        </div>
      </div>
    </div>
  )
}

// ── The method — 01–09 ──────────────────────────────────────────────────────
// indieterminal's numbered workflow tiles, recast as a research method.
const STEPS: { k: string; title: string; body: string }[] = [
  { k: "01", title: "Pose the question", body: "Plain language. No boolean operator gymnastics, no keyword guessing." },
  { k: "02", title: "Gather the corpus", body: "Pulls candidate papers from the open literature, not a stale snapshot." },
  { k: "03", title: "Read in full", body: "Whole papers, not abstracts — the method and the caveats, where they hide." },
  { k: "04", title: "Rank by relevance", body: "Scored on what your question needs, not on how often a paper was cited." },
  { k: "05", title: "Extract findings", body: "Pulls the load-bearing claims, each tied back to its exact source." },
  { k: "06", title: "Cross-examine", body: "Surfaces where papers disagree and where the evidence simply runs out." },
  { k: "07", title: "Synthesize", body: "One coherent answer across the set — the analysis a reviewer would write." },
  { k: "08", title: "Cite verbatim", body: "Every claim links to the real paper. Quotes are quoted, never paraphrased." },
  { k: "09", title: "Export", body: "Lift the lot to BibTeX or CSV and carry it straight into your manuscript." },
]

function Method() {
  return (
    <section id="method" className="relative z-10 mx-auto max-w-5xl px-6 py-20 sm:py-24">
      <motion.div {...inView}>
        <Eyebrow>The method</Eyebrow>
        <h2 className="mt-4 max-w-xl font-serif text-[clamp(26px,4vw,40px)] font-semibold leading-[1.12] tracking-tight text-ink">
          Nine moves from question to cited answer.
        </h2>
      </motion.div>

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        variants={{ show: { transition: { staggerChildren: 0.06 } } }}
        className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3"
      >
        {STEPS.map((s) => (
          <motion.div
            key={s.k}
            variants={REVEAL}
            className="group bg-cream/70 p-6 transition-colors duration-300 hover:bg-cream"
          >
            <p className="ms-label text-[12px] tracking-[0.22em] text-gold">{s.k}</p>
            <h3 className="mt-3 font-serif text-[19px] font-semibold text-ink">{s.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-stone">{s.body}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}

// ── Modules — what's behind the desk ────────────────────────────────────────
const MODULES: { tag: string; name: string; body: string }[] = [
  { tag: "rank", name: "Relevance engine", body: "Reads and scores every candidate against the intent of your question — depth over citation count." },
  { tag: "synth", name: "Synthesis desk", body: "Weaves the top papers into a single answer, contradictions and gaps called out by name." },
  { tag: "cite", name: "Citation ledger", body: "A running tally of every source and the exact line it supports. Audit any claim in one click." },
  { tag: "matrix", name: "Comparison matrix", body: "Lays competing papers side by side across the dimensions you actually care about." },
]

function Modules() {
  return (
    <section id="modules" className="relative z-10 mx-auto max-w-5xl px-6 py-20 sm:py-24">
      <motion.div {...inView}>
        <Eyebrow>Behind the desk</Eyebrow>
        <h2 className="mt-4 max-w-xl font-serif text-[clamp(26px,4vw,40px)] font-semibold leading-[1.12] tracking-tight text-ink">
          The modules doing the work.
        </h2>
      </motion.div>

      <div className="mt-12 divide-y divide-line border-y border-line">
        {MODULES.map((m) => (
          <motion.div
            key={m.name}
            {...inView}
            className="grid grid-cols-1 gap-3 py-7 sm:grid-cols-[200px_1fr] sm:gap-8"
          >
            <div className="flex items-baseline gap-3">
              <span className="ms-label rounded-[4px] bg-parchment px-2 py-0.5 text-[10px] tracking-[0.12em] text-gold">
                {m.tag}
              </span>
              <h3 className="font-serif text-[20px] font-semibold text-ink">{m.name}</h3>
            </div>
            <p className="max-w-2xl text-[15px] leading-relaxed text-body">{m.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ── Live panels — sample output you'd actually get back ─────────────────────
const RANKED = [
  { n: "01", score: 97, title: "Genome-wide profiling of Cas9 off-target activity", meta: "Tsai et al. · Nat. Biotechnol. · 2015" },
  { n: "02", score: 95, title: "High-fidelity Cas9 variants with minimized off-targets", meta: "Kleinstiver et al. · Nature · 2016" },
  { n: "03", score: 92, title: "GUIDE-seq for unbiased off-target detection", meta: "Tsai et al. · Nat. Biotechnol. · 2015" },
]

function PanelShell({ tag, title, children }: { tag: string; title: string; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col rounded-[10px] border border-line bg-cream p-5"
      style={{ boxShadow: "var(--shadow-paper)" }}
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="ms-label text-[10px] tracking-[0.2em] text-stone-light">{tag}</span>
        <span className="font-serif text-[15px] font-semibold text-ink">{title}</span>
      </div>
      {children}
    </div>
  )
}

function LivePanels() {
  return (
    <section className="relative z-10 mx-auto max-w-5xl px-6 py-20 sm:py-24">
      <motion.div {...inView}>
        <Eyebrow>Sample output</Eyebrow>
        <h2 className="mt-4 max-w-xl font-serif text-[clamp(26px,4vw,40px)] font-semibold leading-[1.12] tracking-tight text-ink">
          What comes back to the desk.
        </h2>
      </motion.div>

      <motion.div {...inView} className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Relevance ranking */}
        <PanelShell tag="rank" title="Ranked corpus">
          <ul className="space-y-3">
            {RANKED.map((r) => (
              <li key={r.n} className="flex items-center gap-3">
                <span className="ms-label text-[11px] text-stone-light">{r.n}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-serif text-[13.5px] font-semibold text-ink">{r.title}</p>
                  <p className="truncate font-mono text-[10.5px] text-stone-light">{r.meta}</p>
                </div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-gold">
                  <span className="font-mono text-[12px] font-bold text-gold">{r.score}</span>
                </span>
              </li>
            ))}
          </ul>
        </PanelShell>

        {/* Synthesis with citations */}
        <PanelShell tag="synth" title="Synthesis">
          <p className="font-serif text-[15px] leading-relaxed text-ink">
            High-fidelity Cas9 variants{" "}
            <Cite n="2" /> and anti-CRISPR proteins <Cite n="4" /> cut off-target
            cleavage by up to 40%, while GUIDE-seq <Cite n="3" /> verifies the
            remaining edits genome-wide <Cite n="1" />.
          </p>
        </PanelShell>

        {/* Citation ledger */}
        <PanelShell tag="cite" title="Citation ledger">
          <ul className="space-y-2 font-mono text-[11px] leading-relaxed text-stone">
            <li><span className="text-gold">[1]</span> Tsai et al. Nat. Biotechnol., 2015.</li>
            <li><span className="text-gold">[2]</span> Kleinstiver et al. Nature, 2016.</li>
            <li><span className="text-gold">[3]</span> Tsai et al. Nat. Biotechnol., 2015.</li>
            <li><span className="text-gold">[4]</span> Shin et al. Sci. Adv., 2017.</li>
          </ul>
          <p className="mt-4 border-t border-line pt-3 font-mono text-[10.5px] text-stone-light">
            0 invented citations · every claim linked
          </p>
        </PanelShell>
      </motion.div>
    </section>
  )
}

function Cite({ n }: { n: string }) {
  return (
    <span className="mx-0.5 inline-block translate-y-[-0.15em] align-super text-[0.55em] font-bold">
      <span className="rounded-[3px] bg-gold px-1 py-0.5 font-mono text-cream">[{n}]</span>
    </span>
  )
}

// ── Closer + footer ─────────────────────────────────────────────────────────
function Closer() {
  return (
    <section className="relative z-10 mx-auto max-w-5xl px-6 py-24 sm:py-28">
      <motion.div
        {...inView}
        className="flex flex-col items-center rounded-[16px] border border-line bg-cream/70 px-6 py-16 text-center"
        style={{ boxShadow: "var(--shadow-paper-lg)" }}
      >
        <Eyebrow>Ready when you are</Eyebrow>
        <h2 className="mt-5 max-w-2xl font-serif text-[clamp(30px,5vw,56px)] font-semibold leading-[1.08] tracking-tight text-ink">
          Forty papers. One trustworthy answer.{" "}
          <span className="text-gold">Thirty seconds.</span>
        </h2>
        <p className="mt-5 max-w-md text-[16px] leading-relaxed text-body">
          Your first literature review is one command away. No credit card.
        </p>
        <div className="mt-9">
          <WaxButton label="Open the desk" href="/auth" />
        </div>
      </motion.div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="relative z-10 border-t border-line/80 px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-gold text-[10px] text-ink">
            ✦
          </span>
          <span className="font-serif text-[17px] font-semibold text-ink">Researca</span>
        </div>
        <p className="ms-label text-[11px] tracking-[0.18em] text-stone-light">
          Real papers · real citations · every claim linked
        </p>
        <div className="flex gap-5 text-[13.5px] text-stone">
          <a href="/" className="transition-colors hover:text-ink">Home</a>
          <a href="/classic" className="transition-colors hover:text-ink">How it works</a>
          <a href="/auth" className="transition-colors hover:text-ink">Sign in</a>
        </div>
      </div>
    </footer>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
export function DeskLanding() {
  // Mount-gate the ribbon marquee so SSR and first client paint match (the
  // animation only starts post-mount); this also sidesteps any hydration
  // mismatch. Per the project's reduced-motion note, Windows defaults
  // reduced-motion ON — so the ribbon scroll runs for everyone once mounted,
  // and only the truly gratuitous nothing-extra here is gated on it.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const prefersReduced = useReducedMotion()
  const ribbonRuns = mounted && !prefersReduced

  return (
    <>
      <ReactLenis root options={{ lerp: 0.09, smoothWheel: true }} />
      <main className="relative min-h-screen bg-canvas">
        <FallingBooksNav />
        <CapabilityRibbon animate={ribbonRuns} />
        <Hero />
        <Method />
        <Modules />
        <LivePanels />
        <Closer />
        <Footer />
      </main>
    </>
  )
}
