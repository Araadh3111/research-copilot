"use client"

import { Fragment, useEffect, useRef, useState } from "react"
import { ReactLenis } from "lenis/react"
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  useReducedMotion,
  type MotionValue,
  type Variants,
} from "motion/react"

// ── Palette ───────────────────────────────────────────────────────────────────
// Art-directed "aged paper": fixed regardless of the global light/dark theme.
const PAPER = "#F5F0E8"
const PAPER_CARD = "#FDFAF3" // fresh paper slip — a touch lighter/warmer than the parchment, so it reads mid-flight
const INK = "#1A1714"
const GOLD = "#8B6914"
const EASE_OUT = [0.22, 1, 0.36, 1] as const

// A soft, warm "paper catching light from above" lift: a faint top highlight + a low,
// warm-brown drop shadow. Keeps the index cards legible while they fly in, without
// looking like floating UI — paper slips dropped on a desk.
const CARD_SHADOW =
  "inset 0 1px 0 rgba(255,253,247,0.75), 0 2px 4px rgba(86,62,28,0.10), 0 12px 26px -12px rgba(86,62,28,0.32)"

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

// Each scrolly act after the hero is pulled up by half a screen so its content
// rises into view *as* the previous act's content scrolls out the top — a tight
// conveyor with no empty "release" scroll between acts. Safe because every act's
// content is opacity-0 until its own scroll progress begins (so the pulled-up box
// never bleeds into the previous act).
const ACT_OVERLAP = "-50vh"

// Manuscript chapter labels for the marginalia (folio + progress rail).
const ROMAN = ["I", "II", "III", "IV", "V"]
const ACT_NAMES = ["The Premise", "The Question", "The Search", "The Synthesis", "The Verdict"]
const MARGIN_NOTES = ["MS. Researca", "the question", "n = 24 → 4", "verbatim, cited", "Q.E.D."]

// ── Demo data: a single research question carried through every act ───────────
const QUERY = "CRISPR off-target effects in human cells"

type Paper = {
  n: number
  score: number
  title: string
  authors: string
  venue: string
  year: string
}
const PAPERS: Paper[] = [
  { n: 1, score: 97, title: "Genome-wide profiling of CRISPR-Cas9 off-target activity", authors: "Tsai et al.", venue: "Nat. Biotechnol.", year: "2015" },
  { n: 2, score: 95, title: "High-fidelity Cas9 variants with minimized off-targets", authors: "Kleinstiver et al.", venue: "Nature", year: "2016" },
  { n: 3, score: 92, title: "GUIDE-seq for unbiased genome-wide off-target detection", authors: "Tsai et al.", venue: "Nat. Biotechnol.", year: "2015" },
  { n: 4, score: 88, title: "Anti-CRISPR proteins constrain off-target cleavage", authors: "Shin et al.", venue: "Sci. Adv.", year: "2017" },
]

// The synthesized answer, tokenised so citation markers can pop individually.
type Token = { t: string; cite?: boolean }
const SYNTHESIS: Token[] = [
  { t: "High-fidelity" }, { t: "Cas9" }, { t: "variants" }, { t: "[2]", cite: true },
  { t: "and" }, { t: "anti-CRISPR" }, { t: "proteins" }, { t: "[4]", cite: true },
  { t: "cut" }, { t: "off-target" }, { t: "cleavage" }, { t: "by" }, { t: "up" }, { t: "to" }, { t: "40%," },
  { t: "while" }, { t: "GUIDE-seq" }, { t: "[3]", cite: true },
  { t: "verifies" }, { t: "the" }, { t: "remaining" }, { t: "edits" }, { t: "genome-wide" }, { t: "[1].", cite: true },
]

// ── Film-grain overlay ────────────────────────────────────────────────────────
// Canvas monochrome noise, repainted a few times a second so it shimmers like real
// film grain / paper fibre. Far more visible + reliable than SVG feTurbulence.
function GrainOverlay({ shimmer, opacity }: { shimmer: boolean; opacity: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d", { alpha: true })
    if (!ctx) return
    const TILE = 140
    const tile = document.createElement("canvas")
    tile.width = TILE
    tile.height = TILE
    const tctx = tile.getContext("2d")!
    const genTile = () => {
      const img = tctx.createImageData(TILE, TILE)
      const d = img.data
      for (let i = 0; i < d.length; i += 4) {
        const v = (Math.random() * 255) | 0
        d[i] = d[i + 1] = d[i + 2] = v
        d[i + 3] = 255
      }
      tctx.putImageData(img, 0, 0)
    }
    let dpr = 1
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(window.innerWidth * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
    }
    const paint = () => {
      const pattern = ctx.createPattern(tile, "repeat")
      if (!pattern) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = pattern
      ctx.translate(-Math.random() * TILE, -Math.random() * TILE)
      ctx.fillRect(0, 0, window.innerWidth + TILE, window.innerHeight + TILE)
    }
    resize()
    genTile()
    paint()
    let raf = 0
    let last = 0
    const FPS = 24
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (t - last < 1000 / FPS) return
      last = t
      genTile()
      paint()
    }
    const onResize = () => {
      resize()
      paint()
    }
    window.addEventListener("resize", onResize)
    if (shimmer) raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", onResize)
    }
  }, [shimmer])
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      style={{ opacity, mixBlendMode: "multiply" }}
    />
  )
}

// ── Custom cursor: a soft ink dot that lags behind the pointer ────────────────
function InkCursor() {
  const x = useMotionValue(-100)
  const y = useMotionValue(-100)
  const springX = useSpring(x, { stiffness: 250, damping: 28, mass: 0.6 })
  const springY = useSpring(y, { stiffness: 250, damping: 28, mass: 0.6 })
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      x.set(e.clientX)
      y.set(e.clientY)
    }
    window.addEventListener("pointermove", onMove)
    return () => window.removeEventListener("pointermove", onMove)
  }, [x, y])
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-50 h-4 w-4 rounded-full"
      style={{
        x: springX,
        y: springY,
        marginLeft: -8,
        marginTop: -8,
        background: `radial-gradient(circle, ${INK} 0%, ${INK} 35%, transparent 70%)`,
        mixBlendMode: "multiply",
      }}
    />
  )
}

// ── Marginalia ────────────────────────────────────────────────────────────────
// All marginalia are wide-screen only (`lg:`), low-opacity, and pointer-events-none
// — atmosphere that frames the content without crowding it. They drop entirely on
// narrow screens so content goes full width.

// Faint double hairline framing the text block, like an old book's text-block border.
function PageFrame() {
  const corners = ["left-0 top-0", "right-0 top-0", "left-0 bottom-0", "right-0 bottom-0"]
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-1/2 top-1/2 z-[1] hidden -translate-x-1/2 -translate-y-1/2 lg:block"
      style={{ width: "min(1040px, 84vw)", height: "86vh" }}
    >
      <div className="absolute inset-0" style={{ border: "1px solid rgba(26,23,20,0.09)" }} />
      <div className="absolute inset-[7px]" style={{ border: "1px solid rgba(139,105,20,0.12)" }} />
      {corners.map((c, i) => (
        <span key={i} className={`absolute ${c} m-[5px] h-1 w-1 rounded-full`} style={{ backgroundColor: GOLD, opacity: 0.3 }} />
      ))}
    </div>
  )
}

// Left-margin vertical rule with per-act ticks; fills with gold ink as you scroll.
function ProgressRail({ progress, activeAct }: { progress: MotionValue<number>; activeAct: number }) {
  const fillHeight = useTransform(progress, (v) => `${clamp(v, 0, 1) * 100}%`)
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-[clamp(20px,4vw,60px)] top-1/2 z-20 hidden h-[58vh] -translate-y-1/2 lg:block"
    >
      <div className="relative h-full w-px" style={{ backgroundColor: "rgba(26,23,20,0.13)" }}>
        <motion.div
          className="absolute left-0 top-0 w-px"
          style={{ height: fillHeight, backgroundColor: GOLD, opacity: 0.75 }}
        />
        {ROMAN.map((r, i) => {
          const active = i === activeAct
          return (
            <div key={i} className="absolute -translate-y-1/2" style={{ top: `${(i / (ROMAN.length - 1)) * 100}%`, left: 0 }}>
              <motion.div
                className="h-px origin-left"
                animate={{ width: active ? 18 : 9, opacity: active ? 1 : 0.45 }}
                transition={{ duration: 0.4, ease: EASE_OUT }}
                style={{ backgroundColor: active ? GOLD : "rgba(26,23,20,0.4)" }}
              />
              <span
                className="absolute left-[24px] top-1/2 -translate-y-1/2 text-[9px] tracking-[0.3em]"
                style={{
                  fontFamily: "var(--font-pt-mono), monospace",
                  color: active ? GOLD : "rgba(26,23,20,0.3)",
                }}
              >
                {r}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Folio page marker in the corner, updating per act.
function FolioMarker({ activeAct }: { activeAct: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed bottom-8 right-[clamp(20px,4vw,60px)] z-20 hidden text-right lg:block"
    >
      <p className="text-[10px] tracking-[0.35em]" style={{ fontFamily: "var(--font-pt-mono), monospace", color: "rgba(26,23,20,0.45)" }}>
        fol. {ROMAN[activeAct]}
      </p>
      <AnimatePresence mode="wait">
        <motion.p
          key={activeAct}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.35 }}
          className="mt-1 text-[9px] tracking-[0.18em]"
          style={{ fontFamily: "var(--font-pt-mono), monospace", color: "rgba(26,23,20,0.32)" }}
        >
          {ACT_NAMES[activeAct]}
        </motion.p>
      </AnimatePresence>
    </div>
  )
}

// A faint vertical margin annotation that crossfades per act.
function MarginNote({ activeAct }: { activeAct: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed right-[clamp(20px,4vw,60px)] top-1/2 z-20 hidden h-32 -translate-y-1/2 items-center lg:flex"
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={activeAct}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 0.45, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
          className="text-[10px] tracking-[0.25em] [writing-mode:vertical-rl]"
          style={{ fontFamily: "var(--font-pt-mono), monospace", color: "rgba(26,23,20,0.5)" }}
        >
          {MARGIN_NOTES[activeAct]}
        </motion.span>
      </AnimatePresence>
    </div>
  )
}

// ── Reusable bits ─────────────────────────────────────────────────────────────
function ActLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mb-8 text-center text-[11px] uppercase tracking-[0.35em]"
      style={{ fontFamily: "var(--font-pt-mono), monospace", color: GOLD }}
    >
      {children}
    </p>
  )
}

function WaxSealButton({ label }: { label: string }) {
  return (
    <a
      href="/auth"
      className="group relative inline-flex items-center gap-3 rounded-full px-9 py-4 text-[14px] tracking-[0.04em] transition-transform duration-300 hover:-translate-y-0.5"
      style={{
        backgroundColor: INK,
        color: PAPER,
        fontFamily: "var(--font-inter), system-ui, sans-serif",
        fontWeight: 500,
        boxShadow:
          "0 14px 30px -12px rgba(26,23,20,0.65), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -2px 4px rgba(0,0,0,0.4)",
      }}
    >
      {/* Embossed wax seal */}
      <span
        aria-hidden
        className="grid h-5 w-5 place-items-center rounded-full text-[9px] transition-transform duration-300 group-hover:rotate-12"
        style={{
          backgroundColor: GOLD,
          color: INK,
          boxShadow: "inset 0 1px 1px rgba(255,255,255,0.4), inset 0 -1px 1px rgba(0,0,0,0.3)",
        }}
      >
        ✦
      </span>
      {label}
    </a>
  )
}

// Entrance fade: a second scroll tracker that runs while the section rises from the
// viewport bottom up to its pin (offset start-end → start-start). Fading the act's
// heading in over this window means the next chapter visibly rises into view as the
// previous act's content exits the top — so there's never an empty half-screen
// between acts. `[0.6, 1]` keeps it from peeking too early into the prior act.
function useEntranceOpacity(ref: React.RefObject<HTMLDivElement | null>) {
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start start"] })
  return useTransform(scrollYProgress, [0.6, 1], [0, 1])
}

// ── ACT I — the query writes itself ───────────────────────────────────────────
function QueryAct() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] })
  const entranceOpacity = useEntranceOpacity(ref)
  const [shown, setShown] = useState(0)
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const t = clamp((v - 0.15) / (0.8 - 0.15), 0, 1)
    setShown(Math.round(t * QUERY.length))
  })
  const statusOpacity = useTransform(scrollYProgress, [0.84, 0.96], [0, 1])
  const typing = shown < QUERY.length

  return (
    <section ref={ref} data-act={1} className="relative z-10" style={{ height: "160vh", marginTop: ACT_OVERLAP }}>
      <div className="sticky top-0 flex h-screen w-full items-center justify-center px-6">
        <motion.div style={{ opacity: entranceOpacity }} className="flex w-full flex-col items-center">
          <p className="mb-7 text-[12px] uppercase tracking-[0.32em]">
            <span style={{ fontFamily: "var(--font-pt-mono), monospace", color: GOLD }}>You ask</span>
          </p>
          <p
            className="max-w-3xl text-center text-3xl leading-snug sm:text-4xl md:text-5xl"
            style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontStyle: "italic", color: INK }}
          >
            <span className="opacity-40">“</span>
            {QUERY.slice(0, shown)}
            <motion.span
              aria-hidden
              animate={{ opacity: typing ? [1, 1, 0, 0] : 0 }}
              transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
              className="ml-0.5 inline-block h-[0.9em] w-[3px] translate-y-[0.12em]"
              style={{ backgroundColor: INK }}
            />
            <span className="opacity-40">”</span>
          </p>
          <motion.p style={{ opacity: statusOpacity }} className="mt-10 text-[13px] tracking-[0.04em]">
            <span style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "rgba(26,23,20,0.6)" }}>
              Researca reads <span style={{ color: GOLD }}>24 papers</span> in full…
            </span>
          </motion.p>
        </motion.div>
      </div>
    </section>
  )
}

// ── ACT II — search → synthesis (one pinned stage) ────────────────────────────
// Papers fly in and rank, hold at full opacity, then converge toward the centre —
// scaling down, fading, softening — as the synthesized answer materialises at that
// same centre. A single shared scroll progress drives both, so the papers visually
// *become* the answer (no inter-act seam, no early fade).
function RankAct() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] })
  const entranceOpacity = useEntranceOpacity(ref)

  // Headings crossfade as the act turns from ranking to synthesizing.
  const rankHeadingOpacity = useTransform(p, [0.56, 0.63], [1, 0])
  const synthHeadingOpacity = useTransform(p, [0.63, 0.71], [0, 1])

  // The ranked stack converges into the centre, dissolving as it arrives.
  const cardsScale = useTransform(p, [0.57, 0.71], [1, 0.5])
  const cardsOpacity = useTransform(p, [0.59, 0.7], [1, 0])
  const cardsBlurPx = useTransform(p, [0.57, 0.71], [0, 5])
  const cardsBlur = useMotionTemplate`blur(${cardsBlurPx}px)`

  // The answer forms where the papers converge.
  const answerOpacity = useTransform(p, [0.63, 0.73], [0, 1])
  const answerScale = useTransform(p, [0.63, 0.75], [0.92, 1])
  const answerY = useTransform(p, [0.63, 0.73], [14, 0])
  const footnoteOpacity = useTransform(p, [0.92, 1], [0, 1])

  return (
    <section ref={ref} data-act={2} className="relative z-10" style={{ height: "520vh", marginTop: ACT_OVERLAP }}>
      <div className="sticky top-0 flex h-screen w-full flex-col items-center justify-center px-6">
        <motion.div style={{ opacity: entranceOpacity }} className="flex w-full max-w-2xl flex-col items-center">
          {/* Crossfading chapter heading (fixed-height slot to avoid layout shift) */}
          <div className="relative mb-10 h-4 w-full">
            <motion.p
              style={{ opacity: rankHeadingOpacity, fontFamily: "var(--font-pt-mono), monospace", color: GOLD }}
              className="absolute inset-0 text-center text-[11px] uppercase tracking-[0.35em]"
            >
              Researca ranks them by relevance
            </motion.p>
            <motion.p
              style={{ opacity: synthHeadingOpacity, fontFamily: "var(--font-pt-mono), monospace", color: GOLD }}
              className="absolute inset-0 text-center text-[11px] uppercase tracking-[0.35em]"
            >
              And synthesizes one answer — with citations
            </motion.p>
          </div>

          {/* Stage: the ranked stack and the answer share one centre, layered */}
          <div className="relative w-full" style={{ minHeight: 440 }}>
            {/* Ranked papers — converge + dissolve into the centre */}
            <motion.div
              style={{ scale: cardsScale, opacity: cardsOpacity, filter: cardsBlur }}
              className="absolute inset-0 flex flex-col justify-center gap-3"
            >
              {PAPERS.map((paper, i) => (
                <PaperRowWrapper key={paper.n} paper={paper} index={i} progress={p} />
              ))}
            </motion.div>

            {/* The synthesized answer — materialises where the papers converge */}
            <motion.div
              style={{ opacity: answerOpacity, scale: answerScale, y: answerY }}
              className="absolute inset-0 flex items-center"
            >
              <div
                className="relative w-full rounded-[4px] border px-8 py-9 sm:px-10"
                style={{ backgroundColor: PAPER_CARD, borderColor: "rgba(86,62,28,0.12)", boxShadow: CARD_SHADOW }}
              >
                <span aria-hidden className="absolute left-0 top-6 bottom-6 w-[3px] rounded-full" style={{ backgroundColor: GOLD, opacity: 0.6 }} />
                <p className="text-[19px] leading-relaxed sm:text-[22px]" style={{ fontFamily: "var(--font-playfair), Georgia, serif", color: INK }}>
                  {SYNTHESIS.map((tok, i) => (
                    <SynthWord key={i} token={tok} index={i} total={SYNTHESIS.length} progress={p} />
                  ))}
                </p>
                <motion.div style={{ opacity: footnoteOpacity }} className="mt-8 border-t pt-5">
                  <div className="space-y-1.5">
                    {PAPERS.map((pp) => (
                      <p key={pp.n} className="text-[11px] leading-relaxed" style={{ fontFamily: "var(--font-pt-mono), monospace", color: "rgba(26,23,20,0.55)" }}>
                        <span style={{ color: GOLD }}>[{pp.n}]</span> {pp.authors} · {pp.title}. {pp.venue}, {pp.year}.
                      </p>
                    ))}
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// One ranked paper row: the whole card flies in from the pile (x + rotate settle),
// then its relevance stamp thuds on. Driven entirely by the section's scroll.
function PaperRowWrapper({ paper, index, progress }: { paper: Paper; index: number; progress: MotionValue<number> }) {
  const a0 = 0.03 + index * 0.09
  const a1 = a0 + 0.28
  const x = useTransform(progress, [a0, a1], [220, 0])
  const opacity = useTransform(progress, [a0, a1], [0, 1])
  const rotate = useTransform(progress, [a0, a1], [index % 2 ? 7 : -7, 0])
  const s0 = 0.6 + index * 0.08
  const s1 = s0 + 0.1
  const stampScale = useTransform(progress, [s0, s1], [1.9, 1])
  const stampOpacity = useTransform(progress, [s0, s1], [0, 1])
  const stampRotate = useTransform(progress, [s0, s1], [-22, -8])

  return (
    <motion.div
      style={{
        x,
        opacity,
        rotate,
        backgroundColor: PAPER_CARD,
        borderColor: "rgba(86,62,28,0.12)",
        boxShadow: CARD_SHADOW,
      }}
      className="flex w-full items-center gap-4 rounded-[3px] border px-5 py-4"
    >
      <span
        className="hidden text-[12px] tabular-nums sm:block"
        style={{ fontFamily: "var(--font-pt-mono), monospace", color: "rgba(26,23,20,0.35)" }}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="text-[15px] leading-tight sm:text-[16px]"
          style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontWeight: 600, color: INK }}
        >
          {paper.title}
        </p>
        <p
          className="mt-1 text-[11px]"
          style={{ fontFamily: "var(--font-pt-mono), monospace", color: "rgba(26,23,20,0.5)" }}
        >
          {paper.authors} · {paper.venue} · {paper.year}
        </p>
      </div>
      <motion.div
        style={{ scale: stampScale, opacity: stampOpacity, rotate: stampRotate, borderColor: GOLD }}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2"
      >
        <span
          className="text-[15px] font-bold leading-none tabular-nums"
          style={{ fontFamily: "var(--font-pt-mono), monospace", color: GOLD }}
        >
          {paper.score}
        </span>
      </motion.div>
    </motion.div>
  )
}

// ── ACT III — findings highlight, then synthesize into one cited answer ───────
function SynthWord({ token, index, total, progress }: { token: Token; index: number; total: number; progress: MotionValue<number> }) {
  const start = 0.5 + (index / total) * 0.34
  const end = start + 0.04
  const opacity = useTransform(progress, [start, end], [0.1, 1])
  const y = useTransform(progress, [start, end], [8, 0])
  // Citation chips pop with a little overshoot just after their word lands.
  const scale = useTransform(progress, [end, end + 0.03], token.cite ? [0.5, 1] : [1, 1])

  if (token.cite) {
    return (
      <motion.span
        style={{ opacity, y, scale }}
        className="mx-1 inline-block translate-y-[-0.15em] align-super text-[0.5em] font-bold"
      >
        <span
          className="rounded-[3px] px-1.5 py-0.5"
          style={{ backgroundColor: GOLD, color: PAPER, fontFamily: "var(--font-pt-mono), monospace" }}
        >
          {token.t}
        </span>
      </motion.span>
    )
  }
  return (
    <motion.span style={{ opacity, y }} className="mr-[0.28em] inline-block">
      {token.t}
    </motion.span>
  )
}

function FindingSnippet({ text, cite, a0, progress }: { text: string; cite: string; a0: number; progress: MotionValue<number> }) {
  const a1 = a0 + 0.12
  const opacity = useTransform(progress, [a0, a1], [0, 1])
  const x = useTransform(progress, [a0, a1], [-30, 0])
  const highlight = useTransform(progress, [a0 + 0.03, a1 + 0.03], [0, 1])

  return (
    <motion.div style={{ opacity, x }} className="flex items-start gap-3">
      <span className="relative leading-relaxed">
        <motion.span
          aria-hidden
          style={{ scaleX: highlight, backgroundColor: "rgba(139,105,20,0.22)" }}
          className="absolute inset-x-0 bottom-0 top-0 origin-left rounded-[2px]"
        />
        <span
          className="relative text-[14px]"
          style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "rgba(26,23,20,0.7)" }}
        >
          {text}
        </span>
      </span>
      <span
        className="mt-0.5 shrink-0 rounded-[3px] px-1.5 text-[10px] font-bold"
        style={{ backgroundColor: "rgba(26,23,20,0.08)", color: GOLD, fontFamily: "var(--font-pt-mono), monospace" }}
      >
        {cite}
      </span>
    </motion.div>
  )
}

function SynthesisAct() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] })
  const entranceOpacity = useEntranceOpacity(ref)
  // Snippets appear, then recede fully *before* the answer card arrives (no overlap).
  const snippetsOpacity = useTransform(scrollYProgress, [0.34, 0.42], [1, 0])
  const answerCardOpacity = useTransform(scrollYProgress, [0.42, 0.52], [0, 1])
  const answerCardY = useTransform(scrollYProgress, [0.42, 0.52], [40, 0])
  const footnoteOpacity = useTransform(scrollYProgress, [0.88, 0.99], [0, 1])

  return (
    <section ref={ref} data-act={3} className="relative z-10" style={{ height: "280vh", marginTop: ACT_OVERLAP }}>
      <div className="sticky top-0 flex h-screen w-full items-center justify-center px-6">
        <motion.div style={{ opacity: entranceOpacity }} className="flex w-full max-w-2xl flex-col items-center">
          <ActLabel>And synthesizes one answer — with citations</ActLabel>

          <div className="relative w-full">
            {/* Extracted findings that recede as the answer forms */}
            <motion.div style={{ opacity: snippetsOpacity }} className="absolute -top-4 left-0 right-0 space-y-3">
              <FindingSnippet text="…engineered variants reduced off-target indels ~40%…" cite="[2]" a0={0.05} progress={scrollYProgress} />
              <FindingSnippet text="…GUIDE-seq detected cleavage genome-wide…" cite="[3]" a0={0.12} progress={scrollYProgress} />
              <FindingSnippet text="…anti-CRISPR proteins limited residual activity…" cite="[4]" a0={0.19} progress={scrollYProgress} />
            </motion.div>

            {/* The synthesized answer card */}
            <motion.div
              style={{ opacity: answerCardOpacity, y: answerCardY, backgroundColor: PAPER_CARD }}
              className="relative rounded-[4px] border px-8 py-9 sm:px-10"
            >
            <span aria-hidden className="absolute left-0 top-6 bottom-6 w-[3px] rounded-full" style={{ backgroundColor: GOLD, opacity: 0.6 }} />
            <p
              className="text-[19px] leading-relaxed sm:text-[22px]"
              style={{ fontFamily: "var(--font-playfair), Georgia, serif", color: INK }}
            >
              {SYNTHESIS.map((tok, i) => (
                <SynthWord key={i} token={tok} index={i} total={SYNTHESIS.length} progress={scrollYProgress} />
              ))}
            </p>

            {/* Footnotes draw in */}
            <motion.div style={{ opacity: footnoteOpacity }} className="mt-8 border-t pt-5">
              <div className="space-y-1.5">
                {PAPERS.map((p) => (
                  <p key={p.n} className="text-[11px] leading-relaxed" style={{ fontFamily: "var(--font-pt-mono), monospace", color: "rgba(26,23,20,0.55)" }}>
                    <span style={{ color: GOLD }}>[{p.n}]</span> {p.authors} · {p.title}. {p.venue}, {p.year}.
                  </p>
                ))}
              </div>
            </motion.div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// ── Closer ────────────────────────────────────────────────────────────────────
function CloserAct() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] })
  const opacity = useTransform(scrollYProgress, [0.1, 0.7], [0, 1])
  const y = useTransform(scrollYProgress, [0.1, 0.7], [50, 0])
  return (
    <section
      ref={ref}
      data-act={4}
      className="relative z-10 flex min-h-screen w-full items-center justify-center px-6 py-24"
      style={{ marginTop: ACT_OVERLAP }}
    >
      <motion.div style={{ opacity, y }} className="flex flex-col items-center text-center">
        <h2
          className="max-w-2xl text-3xl leading-[1.15] tracking-tight sm:text-5xl"
          style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontWeight: 600, color: INK }}
        >
          Forty papers. One trustworthy answer.
          <br />
          <span style={{ color: GOLD }}>Thirty seconds.</span>
        </h2>
        <div className="mt-10">
          <WaxSealButton label="Begin researching" />
        </div>
      </motion.div>
    </section>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────
const headlineContainer: Variants = {
  hidden: {},
  show: { transition: { delayChildren: 0.15, staggerChildren: 0.14 } },
}
const wordReveal: Variants = {
  hidden: { opacity: 0, y: "0.45em", filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE_OUT } },
}
const HEADLINE = "Literature review, done in 30 seconds."
const UNDERLINE_DELAY = 1.45
const UNDERLINE_DURATION = 1.1
const POST_INK = UNDERLINE_DELAY + UNDERLINE_DURATION

function Hero({ reduced }: { reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] })
  const y = useTransform(scrollYProgress, [0, 1], [0, -150])
  // Fade out by mid-scroll so the hero is gone exactly as the (pulled-up) query act
  // pins into the centre — no empty gap, no overlap.
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const cueOpacity = useTransform(scrollYProgress, [0, 0.12], [1, 0])
  const words = HEADLINE.split(" ")

  const fadeUp = (delay: number) => ({
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.9, ease: EASE_OUT },
  })

  return (
    <section ref={ref} data-act={0} className="relative z-10 min-h-screen w-full">
      <motion.div style={{ y, opacity }} className="flex min-h-screen w-full items-center justify-center px-6">
        <div className="w-full max-w-3xl">
          <motion.h1
            variants={headlineContainer}
            initial="hidden"
            animate="show"
            className="text-center text-5xl leading-[1.08] tracking-tight sm:text-6xl md:text-7xl lg:text-8xl"
            style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontWeight: 600, color: INK }}
          >
            {words.map((word, i) => (
              <Fragment key={i}>
                <motion.span variants={wordReveal} className="inline-block">
                  {word}
                </motion.span>
                {i < words.length - 1 ? " " : ""}
              </Fragment>
            ))}
          </motion.h1>

          <svg aria-hidden viewBox="0 0 680 28" fill="none" className="mx-auto mt-4 block w-[86%] max-w-2xl">
            <motion.path
              d="M6 17 C 150 8, 290 22, 420 13 C 535 5, 615 21, 674 11"
              stroke={GOLD}
              strokeWidth={4.5}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: UNDERLINE_DELAY, duration: UNDERLINE_DURATION, ease: [0.65, 0, 0.35, 1] }}
              style={{ filter: "drop-shadow(0 1px 0.5px rgba(139,105,20,0.25))" }}
            />
          </svg>

          <motion.p
            {...fadeUp(POST_INK + 0.1)}
            className="mx-auto mt-8 max-w-[560px] text-center text-[16px] leading-relaxed sm:text-[18px]"
            style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", color: "rgba(26,23,20,0.72)" }}
          >
            Researca reads real academic papers, ranks them by relevance, and synthesizes findings with
            citations — not hallucinations.
          </motion.p>

          <motion.div {...fadeUp(POST_INK + 0.3)} className="mt-9 flex justify-center">
            <WaxSealButton label="Begin researching" />
          </motion.div>
        </div>
      </motion.div>

      <motion.div
        style={{ opacity: cueOpacity }}
        className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 text-center"
      >
        <p className="text-[11px] uppercase tracking-[0.3em]" style={{ fontFamily: "var(--font-pt-mono), monospace", color: "rgba(26,23,20,0.5)" }}>
          Watch it work
        </p>
        <motion.div
          aria-hidden
          animate={reduced ? undefined : { y: [0, 8, 0] }}
          transition={reduced ? undefined : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto mt-2 h-3 w-px"
          style={{ backgroundColor: "rgba(26,23,20,0.4)" }}
        />
      </motion.div>
    </section>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
export function ManuscriptLanding() {
  // Mount-gate so the first client paint matches SSR (avoids hydration mismatch on
  // anything derived from the OS reduced-motion setting). Reduced-motion only trims
  // gratuitous flourishes (fake cursor, grain shimmer, the looping cue) — the
  // scroll story itself runs for everyone, by design.
  const prefersReduced = useReducedMotion()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const reduced = mounted && !!prefersReduced

  // Whole-page scroll progress drives the marginalia progress rail; the active act
  // (nearest section centre to viewport centre) drives the folio + margin note.
  const { scrollYProgress: pageProgress } = useScroll()
  const [activeAct, setActiveAct] = useState(0)
  useMotionValueEvent(pageProgress, "change", () => {
    if (typeof document === "undefined") return
    const vc = window.innerHeight / 2
    let best = 0
    let bestDist = Infinity
    document.querySelectorAll<HTMLElement>("[data-act]").forEach((el) => {
      const r = el.getBoundingClientRect()
      const d = Math.abs(r.top + r.height / 2 - vc)
      if (d < bestDist) {
        bestDist = d
        best = Number(el.dataset.act)
      }
    })
    setActiveAct(best)
  })

  return (
    <>
      <ReactLenis root options={{ lerp: 0.085, wheelMultiplier: 1, smoothWheel: true }} />

      <main className="relative" style={{ backgroundColor: PAPER, cursor: reduced ? "auto" : "none" }}>
        <GrainOverlay shimmer={!reduced} opacity={0.14} />
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            background:
              "radial-gradient(ellipse 68% 68% at 50% 42%, transparent 46%, rgba(26,23,20,0.18) 84%, rgba(26,23,20,0.34) 100%)",
          }}
        />
        <PageFrame />

        <Hero reduced={reduced} />
        <QueryAct />
        <RankAct />
        <SynthesisAct />
        <CloserAct />

        <ProgressRail progress={pageProgress} activeAct={activeAct} />
        <FolioMarker activeAct={activeAct} />
        <MarginNote activeAct={activeAct} />

        {!reduced && <InkCursor />}
      </main>
    </>
  )
}
