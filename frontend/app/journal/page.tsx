"use client"

import { motion } from "motion/react"
import {
  GOLD, STAR, LINE, DISPLAY, BODY, MONO,
  Mono, Rule, RuleDraw, CoverButton, PageShell, reveal,
} from "@/components/landing/observatory-chrome"

type Entry = { vol: string; date: string; tag: string; title: string; body: string; notes: string[] }
const ENTRIES: Entry[] = [
  {
    vol: "Vol. 04", date: "Jun 2026", tag: "Engineering",
    title: "Full-text reading goes live",
    body: "Papers are now read in full — chunked, embedded, and ranked on their actual methods and results rather than abstracts. This is the change the rebuild was for.",
    notes: ["Embeddings moved to a hosted model (no more cold-start OOM)", "pgvector store for paper + library chunks", "Citations wired to exact sources"],
  },
  {
    vol: "Vol. 03", date: "Jun 2026", tag: "Product",
    title: "Bring-your-own-PDF library",
    body: "Upload papers you have rights to and Researca reads them privately alongside open-access results — the legal route to covering paywalled work without ever fetching it.",
    notes: ["Per-user private library with quotas", "Consent at upload", "One-click data + account deletion"],
  },
  {
    vol: "Vol. 02", date: "May 2026", tag: "Trust",
    title: "Honest ranking & cost guardrails",
    body: "Relevance ranking rebuilt to favour your question over citation fame, plus a two-stage budget guard so a runaway query can never drain the API.",
    notes: ["~90% cut in cost-per-search", "Open-access coverage badges", "arXiv as a first-class source"],
  },
  {
    vol: "Vol. 01", date: "Apr 2026", tag: "Origins",
    title: "First synthesis pipeline",
    body: "The first working search → synthesis flow. A real ML researcher tested it, told us the truth, and agreed to test the rebuild. That feedback set the whole roadmap.",
    notes: ["Plain-language query → cited answer", "Comparison matrix (early)", "The 2/5 that started everything"],
  },
]

export default function JournalPage() {
  return (
    <PageShell
      eyebrow="Journal · field notes"
      title={<>The build<br /><span style={{ color: GOLD }}>journal.</span></>}
      lede="Researca is built in the open. Every volume is a real change shipped — what moved, why it mattered, and what's next."
    >
      <section className="relative z-10 w-full pt-12">
        <div className="mx-auto max-w-6xl px-6 pb-20">
          {ENTRIES.map((e, i) => (
            <motion.article key={e.vol} {...reveal} transition={{ ...reveal.transition, delay: i * 0.05 }}
              className="grid grid-cols-1 gap-6 border-b py-12 sm:grid-cols-[200px_1fr] sm:gap-12" style={{ borderColor: LINE }}>
              <div>
                <Mono className="text-[12px]" style={{ color: GOLD }}>{e.vol}</Mono>
                <Mono className="mt-2 block text-[10px]" style={{ color: "var(--text-muted)" }}>{e.date}</Mono>
                <span className="mt-4 inline-block px-2 py-0.5" style={{ border: `1px solid ${LINE}` }}>
                  <Mono className="text-[9px]" style={{ color: "var(--text-secondary)" }}>{e.tag}</Mono>
                </span>
              </div>
              <div>
                <h2 className="text-[clamp(26px,3.5vw,40px)] font-bold uppercase leading-[0.98] tracking-tight" style={{ fontFamily: DISPLAY, color: STAR }}>{e.title}</h2>
                <p className="mt-4 max-w-2xl text-[16px] leading-relaxed" style={{ fontFamily: BODY, color: "var(--text-body)" }}>{e.body}</p>
                <ul className="mt-6 space-y-2">
                  {e.notes.map((n) => (
                    <li key={n} className="flex items-start gap-3 text-[14px]" style={{ fontFamily: MONO, color: "var(--text-secondary)" }}>
                      <span className="mt-[7px] h-1 w-3 shrink-0" style={{ backgroundColor: GOLD }} />{n}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="relative z-10 w-full">
        <div className="mx-auto max-w-6xl px-6">
          <Rule strong />
          <div className="flex flex-col items-start gap-8 py-16 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="max-w-xl text-[clamp(30px,5vw,60px)] font-black uppercase leading-[0.92] tracking-[-0.03em]" style={{ fontFamily: DISPLAY, color: STAR }}>
              Next volume:<br /><span style={{ color: GOLD }}>the agent.</span>
            </h2>
            <div className="shrink-0">
              <p className="mb-5 max-w-xs text-[14px] leading-relaxed" style={{ fontFamily: BODY, color: "var(--text-body)" }}>
                A research agent that plans, reads, and surfaces contradictions and gaps. Be there when it lands.
              </p>
              <CoverButton label="Start free" />
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  )
}
