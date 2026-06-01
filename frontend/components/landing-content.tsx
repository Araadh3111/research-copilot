"use client"

import { useEffect, useRef } from "react"
import { BookOpen, GitMerge, ShieldCheck, ArrowRight } from "lucide-react"

const DEMO_ROWS = [
  {
    paper: "Jinek et al. (2012) · Science",
    approach: "Biochemical characterization of Cas9 as a dual-RNA-programmable nuclease",
    finding: "Cas9 creates precise DSBs at target DNA sites guided by crRNA:tracrRNA duplex; single chimeric guide RNA is sufficient",
    limitation: "In vitro study only; eukaryotic chromatin accessibility not addressed",
    status: "Foundational",
  },
  {
    paper: "Cong et al. (2013) · Science",
    approach: "Cas9-mediated multiplex genome editing in human HEK293 and mouse cells",
    finding: "First demonstration of CRISPR editing in mammalian cells; achieved simultaneous editing at multiple loci",
    limitation: "Off-target cleavage detected at loci with sequence similarity; delivery not optimized",
    status: "Preclinical",
  },
  {
    paper: "Anzalone et al. (2019) · Nature",
    approach: "Prime editing via pegRNA and reverse transcriptase fused to nCas9",
    finding: "All 12 types of point mutations achievable; 4× lower off-target rate than Cas9; no DSBs required",
    limitation: "Lower efficiency in post-mitotic cells; large construct limits viral delivery",
    status: "Preclinical",
  },
  {
    paper: "Frangoul et al. (2021) · NEJM",
    approach: "Ex vivo BCL11A enhancer disruption in HSCs to reactivate fetal hemoglobin (CTX001)",
    finding: "Both patients achieved transfusion independence; fetal Hb sustained at 12+ months post-infusion",
    limitation: "n=2; requires myeloablative conditioning; cost >$2M; long-term durability unknown",
    status: "Phase 1/2 Trial",
  },
  {
    paper: "Gaudelli et al. (2017) · Nature",
    approach: "Adenine base editing (ABE) — adenosine deaminase fused to nCas9",
    finding: "A·T → G·C conversions at up to 50% efficiency with <0.1% indel rate; no DSBs",
    limitation: "Requires TC motif; bystander editing at adjacent adenosines; RNA off-targets reported",
    status: "Derivatives in Phase 1",
  },
]

const VALUE_PROPS = [
  {
    icon: BookOpen,
    title: "Relevance-ranked, not citation-ranked",
    description:
      "Papers are ranked by semantic relevance to your specific query — not by how famous they are. You get what matters, not what's popular.",
  },
  {
    icon: GitMerge,
    title: "Cross-paper synthesis",
    description:
      "Researca reads all papers together and finds contradictions, emerging consensus, and open gaps that single-paper summaries miss.",
  },
  {
    icon: ShieldCheck,
    title: "Real citations, zero hallucinations",
    description:
      "Every claim links directly to the paper it came from. No invented citations. No confident confabulations. Just what the literature actually says.",
  },
]

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return

    const els = container.querySelectorAll<HTMLElement>("[data-reveal]")
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement
            const delay = el.dataset.delay ?? "0"
            setTimeout(() => el.classList.add("revealed"), parseInt(delay, 10))
            obs.unobserve(el)
          }
        })
      },
      { threshold: 0.1 },
    )

    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  return ref
}

export function LandingContent() {
  const rootRef = useScrollReveal()

  return (
    <div ref={rootRef}>
      <style>{`
        [data-reveal] {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.55s ease, transform 0.55s ease;
        }
        [data-reveal].revealed {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>

      {/* ── Section 1: Hero ── */}
      <section className="px-6 pb-24 pt-20 md:pt-32" style={{ background: "#FAFAF9" }}>
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <span
            data-reveal
            className="mb-5 inline-block rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#2563EB]"
          >
            Built by a 15-year-old researcher
          </span>

          <h1
            data-reveal
            data-delay="80"
            className="text-balance text-[#1C1917]"
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: "clamp(40px, 6vw, 64px)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.08,
            }}
          >
            Literature review in 30 seconds.
          </h1>

          <p
            data-reveal
            data-delay="160"
            className="mt-6 max-w-xl text-[18px] leading-relaxed text-[#78716C]"
          >
            Researca reads 20+ papers, ranks by actual relevance, and synthesizes findings
            with real citations — not hallucinations.
          </p>

          <div data-reveal data-delay="240" className="mt-9 flex items-center gap-4">
            <a
              href="/auth"
              className="inline-flex items-center gap-2 rounded-full bg-[#2563EB] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8]"
            >
              Start for free
              <ArrowRight className="size-4" />
            </a>
            <a
              href="#demo"
              className="inline-flex items-center gap-2 rounded-full border border-[#E5E4E2] bg-white px-6 py-2.5 text-sm font-medium text-[#1C1917] transition-colors hover:bg-[#F5F4F2]"
            >
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* ── Section 2: Live Demo ── */}
      <section id="demo" className="px-6 py-20 bg-white">
        <div className="mx-auto max-w-5xl">
          <div data-reveal className="mb-3 text-center">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#2563EB]">
              Real output from Researca
            </span>
          </div>
          <h2
            data-reveal
            data-delay="80"
            className="mb-3 text-center text-[28px] font-bold tracking-tight text-[#1C1917]"
          >
            See it work on a real query
          </h2>
          <p
            data-reveal
            data-delay="120"
            className="mb-10 text-center text-[15px] text-[#78716C]"
          >
            Query: <span className="font-medium text-[#1C1917]">&ldquo;CRISPR gene editing therapeutic applications&rdquo;</span>
          </p>

          <div
            data-reveal
            data-delay="160"
            className="overflow-hidden rounded-2xl border border-[#E5E4E2] bg-white shadow-sm"
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {["Paper", "Approach", "Key Finding", "Limitation", "Status"].map((h) => (
                      <th
                        key={h}
                        className="border-b border-[#E5E4E2] bg-[#FAFAF9] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#78716C]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DEMO_ROWS.map((row, i) => (
                    <tr
                      key={i}
                      className={`border-b border-[#E5E4E2] last:border-0 ${i % 2 === 1 ? "bg-[#FAFAF9]" : "bg-white"}`}
                    >
                      <td className="px-4 py-3.5 align-top text-[13px] font-medium text-[#1C1917] min-w-[160px]">
                        {row.paper}
                      </td>
                      <td className="px-4 py-3.5 align-top text-[13px] leading-relaxed text-[#44403C] min-w-[200px]">
                        {row.approach}
                      </td>
                      <td className="px-4 py-3.5 align-top text-[13px] leading-relaxed text-[#44403C] min-w-[240px]">
                        {row.finding}
                      </td>
                      <td className="px-4 py-3.5 align-top text-[13px] leading-relaxed text-[#44403C] min-w-[180px]">
                        {row.limitation}
                      </td>
                      <td className="px-4 py-3.5 align-top min-w-[120px]">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          row.status.includes("Trial")
                            ? "bg-[#EFF6FF] text-[#2563EB]"
                            : row.status === "Foundational"
                            ? "bg-[#F0FDF4] text-[#16A34A]"
                            : "bg-[#F5F4F2] text-[#78716C]"
                        }`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 3: Value Props ── */}
      <section id="features" className="px-6 py-20" style={{ background: "#FAFAF9" }}>
        <div className="mx-auto max-w-5xl">
          <h2
            data-reveal
            className="mb-14 text-center text-[28px] font-bold tracking-tight text-[#1C1917]"
          >
            Why researchers use Researca
          </h2>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {VALUE_PROPS.map((prop, i) => (
              <div
                key={prop.title}
                data-reveal
                data-delay={String(i * 100)}
                className="rounded-2xl border border-[#E5E4E2] bg-white p-6"
              >
                <span className="inline-flex size-10 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
                  <prop.icon className="size-5" />
                </span>
                <h3 className="mt-4 text-[15px] font-semibold text-[#1C1917]">{prop.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#78716C]">{prop.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 4: Founder Story ── */}
      <section className="bg-white px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <div data-reveal>
            <svg
              className="mx-auto mb-6 size-8 text-[#E5E4E2]"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
            </svg>
            <blockquote
              className="text-[18px] leading-relaxed text-[#1C1917]"
              style={{ fontFamily: "Georgia, serif" }}
            >
              I&apos;m 15 years old. I built Researca because I was writing my own research paper
              on prosthetic arms and couldn&apos;t find a tool that actually synthesized across
              papers without hallucinating citations. So I built it.
            </blockquote>
            <p className="mt-5 text-sm font-medium text-[#78716C]">— Araadh, Founder · Chandigarh, India</p>
          </div>
        </div>
      </section>
      

      {/* ── Section 5: Pricing ── */}
      <section id="pricing" className="px-6 py-20" style={{ background: "#FAFAF9" }}>
        <div className="mx-auto max-w-3xl">
          <h2
            data-reveal
            className="mb-12 text-center text-[28px] font-bold tracking-tight text-[#1C1917]"
          >
            Simple pricing
          </h2>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Free */}
            <div
              data-reveal
              className="rounded-2xl border border-[#E5E4E2] bg-white p-8"
            >
              <p className="text-[13px] font-semibold uppercase tracking-wider text-[#78716C]">Free</p>
              <p className="mt-3 text-[40px] font-bold tracking-tight text-[#1C1917]">$0</p>
              <p className="mt-1 text-sm text-[#78716C]">forever</p>
              <ul className="mt-6 space-y-3">
                {["10 searches / month", "Synthesis mode", "Comparison matrix", "Real citations"].map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-[#44403C]">
                    <span className="size-1.5 rounded-full bg-[#2563EB]" />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="/auth"
                className="mt-8 block rounded-full border border-[#E5E4E2] bg-white px-5 py-2.5 text-center text-sm font-medium text-[#1C1917] transition-colors hover:bg-[#F5F4F2]"
              >
                Start free — no credit card
              </a>
            </div>

            {/* Pro */}
            <div
              data-reveal
              data-delay="100"
              className="rounded-2xl border-2 border-[#2563EB] bg-white p-8"
            >
              <p className="text-[13px] font-semibold uppercase tracking-wider text-[#2563EB]">Pro</p>
              <p className="mt-3 text-[40px] font-bold tracking-tight text-[#1C1917]">$29</p>
              <p className="mt-1 text-sm text-[#78716C]">per month</p>
              <ul className="mt-6 space-y-3">
                {[
                  "30 searches / day",
                  "Everything in Free",
                  "Priority processing",
                  "Early access to new features",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-[#44403C]">
                    <span className="size-1.5 rounded-full bg-[#2563EB]" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-8 block rounded-full border border-[#E5E4E2] bg-[#F5F4F2] px-5 py-2.5 text-center text-sm font-medium text-[#78716C]">
                Coming soon
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 6: CTA Banner ── */}
      <section className="bg-white px-6 py-20">
        <div data-reveal className="mx-auto max-w-xl text-center">
          <h2
            className="text-[28px] font-bold tracking-tight text-[#1C1917]"
            style={{ fontFamily: "Georgia, serif" }}
          >
            Ready to research faster?
          </h2>
          <p className="mt-4 text-[15px] text-[#78716C]">
            No credit card required · Takes 30 seconds to sign up
          </p>
          <a
            href="/auth"
            className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#2563EB] px-7 py-3 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8]"
          >
            Try Researca free
            <ArrowRight className="size-4" />
          </a>
        </div>
      </section>
    </div>
  )
}
