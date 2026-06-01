"use client"

import { useEffect, useState } from "react"
import { Check, Loader2, Database, BookOpen, ListOrdered, Sparkles } from "lucide-react"

/**
 * Cinematic multi-stage loader shown while a search is in flight before any
 * results stream back. The backend doesn't emit progress events, so the stages
 * auto-advance on a timer to convey momentum ("it's reading 20 papers…"). The
 * final stage stays in its in-progress state until the parent unmounts this
 * (i.e. papers/synthesis arrive).
 */
const STAGES = [
  { icon: Database, label: "Searching academic databases" },
  { icon: BookOpen, label: "Reading 20+ papers" },
  { icon: ListOrdered, label: "Ranking by relevance" },
  { icon: Sparkles, label: "Synthesizing findings" },
]

export function ResearchLoader() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    // Advance through stages, holding on the last one until results replace us.
    const timers = [
      setTimeout(() => setActive(1), 900),
      setTimeout(() => setActive(2), 2100),
      setTimeout(() => setActive(3), 3300),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div className="mt-8 w-full max-w-3xl">
      <div className="overflow-hidden rounded-2xl border border-line bg-cream p-6 shadow-sm">
        <div className="relative mb-5 h-1 overflow-hidden rounded-full bg-parchment">
          <span className="loader-shimmer absolute inset-y-0 left-0 w-1/3 rounded-full bg-gold/70" />
        </div>
        <ul className="space-y-3">
          {STAGES.map((s, i) => {
            const done = i < active
            const current = i === active
            const Icon = s.icon
            return (
              <li
                key={s.label}
                className={`flex items-center gap-3 text-sm transition-all duration-500 ${
                  done || current ? "opacity-100" : "opacity-40"
                }`}
              >
                <span
                  className={`inline-flex size-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    done
                      ? "border-gold/40 bg-gold/10 text-gold"
                      : current
                        ? "border-line-strong bg-parchment text-ink"
                        : "border-line bg-parchment text-stone-light"
                  }`}
                >
                  {done ? (
                    <Check className="size-3.5" strokeWidth={3} />
                  ) : current ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Icon className="size-3.5" />
                  )}
                </span>
                <span className={done || current ? "font-medium text-ink" : "text-stone"}>
                  {s.label}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
