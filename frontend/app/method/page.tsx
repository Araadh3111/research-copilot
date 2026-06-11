"use client"

import { motion } from "motion/react"
import {
  GOLD, STAR, INK, LINE, LINE_STRONG, DISPLAY, BODY, MONO,
  Mono, Rule, RuleDraw, CoverButton, PageShell, reveal,
} from "@/components/landing/observatory-chrome"

const PIPELINE = [
  { k: "01", t: "Understand", b: "Your plain-language question is parsed into the concepts and constraints that actually define the search — not just keywords." },
  { k: "02", t: "Gather", b: "Researca pulls candidate papers from open sources (arXiv, open-access journals) and any PDFs you've added to your private library." },
  { k: "03", t: "Read in full", b: "Each candidate's full text is chunked and embedded, so ranking and synthesis reason over methods and results — not abstracts." },
  { k: "04", t: "Rank by relevance", b: "Papers are scored against your specific question. A precise, recent, on-topic paper outranks a famous but tangential one." },
  { k: "05", t: "Synthesise", b: "The top papers are composed into one answer, written to be grounded in the source text, never overclaiming beyond it." },
  { k: "06", t: "Cite & verify", b: "Every claim carries a citation linked to its exact source. Open the paper and check it in one click." },
]

const FACTS = [
  { n: "Full text", l: "not abstracts" },
  { n: "Per-claim", l: "citations" },
  { n: "Open access", l: "+ your PDFs" },
  { n: "≈ 30s", l: "question → answer" },
]

export default function MethodPage() {
  return (
    <PageShell
      eyebrow="Method · how it works"
      title={<>How Researca<br />actually <span style={{ color: GOLD }}>reads.</span></>}
      lede="No black box. Here is the exact path from a question you type to an answer you can trust — and why each step exists."
    >
      {/* Facts strip */}
      <section className="relative z-10 w-full">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-2 border-b sm:grid-cols-4" style={{ borderColor: LINE }}>
            {FACTS.map((f, i) => (
              <motion.div key={f.l} {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }}
                className="px-2 py-8 sm:px-6 sm:[&:not(:first-child)]:border-l" style={{ borderColor: LINE }}>
                <div className="text-[26px] font-black uppercase tracking-tight sm:text-[32px]" style={{ fontFamily: DISPLAY, color: GOLD }}>{f.n}</div>
                <Mono className="mt-2 block text-[10px]" style={{ color: "var(--text-muted)" }}>{f.l}</Mono>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section className="relative z-10 w-full pt-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex items-baseline justify-between py-5">
            <Mono className="text-[11px]" style={{ color: GOLD }}>§ 01</Mono>
            <Mono className="text-[11px]" style={{ color: "var(--text-muted)" }}>The pipeline · six steps</Mono>
          </div>
          <RuleDraw strong />
          <div className="pb-20">
            {PIPELINE.map((s, i) => (
              <motion.div key={s.k} {...reveal} transition={{ ...reveal.transition, delay: i * 0.05 }}
                className="group grid grid-cols-1 items-baseline gap-3 border-b py-9 sm:grid-cols-[100px_280px_1fr] sm:gap-8" style={{ borderColor: LINE }}>
                <Mono className="text-[13px]" style={{ color: GOLD }}>{s.k}</Mono>
                <h3 className="text-[26px] font-bold uppercase tracking-tight transition-colors group-hover:text-[var(--highlight)]" style={{ fontFamily: DISPLAY, color: STAR }}>{s.t}</h3>
                <p className="max-w-xl text-[15px] leading-relaxed" style={{ fontFamily: BODY, color: "var(--text-body)" }}>{s.b}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* What it won't do */}
      <section className="relative z-10 w-full">
        <div className="mx-auto max-w-6xl px-6 pb-16">
          <div className="flex items-baseline justify-between py-5">
            <Mono className="text-[11px]" style={{ color: GOLD }}>§ 02</Mono>
            <Mono className="text-[11px]" style={{ color: "var(--text-muted)" }}>The guardrails</Mono>
          </div>
          <RuleDraw strong />
          <div className="grid grid-cols-1 gap-px pt-px sm:grid-cols-3" style={{ backgroundColor: LINE }}>
            {[
              ["Never invents citations", "If a claim has no source in the read papers, it isn't made."],
              ["Never hides the source", "Every statement is one click from the paper it came from."],
              ["Never overclaims", "Synthesis stays inside what the text supports — caveats included."],
            ].map(([t, b], i) => (
              <motion.div key={t} {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }} className="px-7 py-9" style={{ backgroundColor: INK }}>
                <h3 className="text-[18px] font-bold uppercase tracking-tight" style={{ fontFamily: DISPLAY, color: STAR }}>{t}</h3>
                <p className="mt-3 text-[14px] leading-relaxed" style={{ fontFamily: BODY, color: "var(--text-body)" }}>{b}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 w-full">
        <div className="mx-auto max-w-6xl px-6">
          <Rule strong />
          <div className="flex flex-col items-start gap-8 py-16 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="max-w-xl text-[clamp(30px,5vw,60px)] font-black uppercase leading-[0.92] tracking-[-0.03em]" style={{ fontFamily: DISPLAY, color: STAR }}>
              See it run on<br />your question.
            </h2>
            <CoverButton label="Begin researching" />
          </div>
        </div>
      </section>
    </PageShell>
  )
}
