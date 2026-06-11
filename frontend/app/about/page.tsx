"use client"

import { motion } from "motion/react"
import {
  GOLD, STAR, LINE, LINE_STRONG, DISPLAY, BODY, MONO,
  Mono, Rule, RuleDraw, CoverButton, PageShell, reveal,
} from "@/components/landing/observatory-chrome"

const PRINCIPLES = [
  { k: "01", t: "Cite everything", b: "Every claim Researca makes links to the exact paper it came from. If it can't cite it, it doesn't say it." },
  { k: "02", t: "Read, don't skim", b: "Abstracts lie by omission. Researca reads the full text, because that's where the methods, caveats and real results live." },
  { k: "03", t: "Relevance over fame", b: "A perfect 2018 paper beats a famous 2012 one. Ranking is about your question, not citation counts." },
  { k: "04", t: "Earn the upgrade", b: "The free tier is genuinely useful. You only pay when Researca is already saving you hours." },
]

const TIMELINE = [
  { d: "2025", t: "The itch", b: "Reading for a project meant 40 open tabs and no synthesis. Existing tools summarised abstracts and hallucinated citations." },
  { d: "Early 2026", t: "First version", b: "A working search → synthesis pipeline. A real ML researcher tested it, rated relevance 2/5, and named the fix: read full papers, real relevance, clean citations." },
  { d: "Mid 2026", t: "The rebuild", b: "Full-text reading, a proper embedding + ranking pipeline, and citations wired to their sources. The critic agreed to test it again." },
  { d: "Next", t: "The agent", b: "A research agent that plans, reads, and surfaces contradictions and gaps across the literature — the analysis researchers actually want." },
]

export default function AboutPage() {
  return (
    <PageShell
      eyebrow="About · the masthead"
      title={<>Built in the<br /><span style={{ color: GOLD }}>open,</span> for<br />researchers.</>}
      lede="Researca started because reading the literature is slow, lonely, and easy to get wrong. It's built in the open by a 15-year-old in Chandigarh who got tired of tools that summarise abstracts and invent citations."
    >
      {/* Manifesto */}
      <section className="relative z-10 w-full pt-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex items-baseline justify-between py-5">
            <Mono className="text-[11px]" style={{ color: GOLD }}>§ 01</Mono>
            <Mono className="text-[11px]" style={{ color: "var(--text-muted)" }}>What we believe</Mono>
          </div>
          <RuleDraw strong />
          <div className="grid grid-cols-1 border-t sm:grid-cols-2" style={{ borderColor: LINE }}>
            {PRINCIPLES.map((p, i) => (
              <motion.div key={p.k} {...reveal} transition={{ ...reveal.transition, delay: (i % 2) * 0.1 }}
                className="border-b px-2 py-8 sm:px-7 sm:[&:nth-child(even)]:border-l" style={{ borderColor: LINE }}>
                <Mono className="text-[11px]" style={{ color: GOLD }}>{p.k}</Mono>
                <h3 className="mt-4 text-[24px] font-bold uppercase tracking-tight" style={{ fontFamily: DISPLAY, color: STAR }}>{p.t}</h3>
                <p className="mt-3 max-w-md text-[15px] leading-relaxed" style={{ fontFamily: BODY, color: "var(--text-body)" }}>{p.b}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="relative z-10 w-full pt-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex items-baseline justify-between py-5">
            <Mono className="text-[11px]" style={{ color: GOLD }}>§ 02</Mono>
            <Mono className="text-[11px]" style={{ color: "var(--text-muted)" }}>How it got here</Mono>
          </div>
          <RuleDraw strong />
          <div className="pb-20">
            {TIMELINE.map((e, i) => (
              <motion.div key={e.d} {...reveal} transition={{ ...reveal.transition, delay: i * 0.06 }}
                className="grid grid-cols-1 gap-2 border-b py-8 sm:grid-cols-[160px_1fr] sm:gap-10" style={{ borderColor: LINE }}>
                <Mono className="text-[12px]" style={{ color: GOLD }}>{e.d}</Mono>
                <div>
                  <h3 className="text-[22px] font-bold uppercase tracking-tight" style={{ fontFamily: DISPLAY, color: STAR }}>{e.t}</h3>
                  <p className="mt-2 max-w-2xl text-[15px] leading-relaxed" style={{ fontFamily: BODY, color: "var(--text-body)" }}>{e.b}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pull quote */}
      <section className="relative z-10 w-full">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <Rule strong />
          <motion.blockquote {...reveal} className="py-14 text-[clamp(24px,3.5vw,40px)] leading-[1.15]"
            style={{ fontFamily: "var(--font-serif), Georgia, serif", color: STAR }}>
            “A tool researchers love is downstream of a genuinely good product. The
            foundation — full text, honest ranking, real citations — comes first.
            <span style={{ color: GOLD }}> The cathedral comes after.”</span>
          </motion.blockquote>
          <Rule strong />
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 w-full">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-6 py-16 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="max-w-xl text-[clamp(30px,5vw,60px)] font-black uppercase leading-[0.92] tracking-[-0.03em]" style={{ fontFamily: DISPLAY, color: STAR }}>
            Try it on your<br />own question.
          </h2>
          <CoverButton label="Begin researching" />
        </div>
      </section>
    </PageShell>
  )
}
