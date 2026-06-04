"use client"

import type React from "react"
import { useState } from "react"
import { Sparkles, Lock, Loader2, PenLine } from "lucide-react"

import { API_BASE_URL } from "@/lib/api"
import { createClient } from "@/utils/supabase/client"

type Props = {
  isPro: boolean
  query: string
  synthesis: string
  draft: string
  setDraft: React.Dispatch<React.SetStateAction<string>>
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onUpgrade: () => void
}

export function WritingPanel({ isPro, query, synthesis, draft, setDraft, textareaRef, onUpgrade }: Props) {
  const supabase = createClient()
  const [writing, setWriting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function writeWithAI() {
    if (writing) return
    setWriting(true)
    setError(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch(`${API_BASE_URL}/write`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, synthesis, draft }),
      })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null)
        throw new Error(
          (data && (data.message || data.detail)) || `Request failed (status ${res.status}).`,
        )
      }

      // Separate the continuation from existing text so words don't run together.
      setDraft((prev) => (prev.length && !/\s$/.test(prev) ? prev + " " : prev))

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          let event: Record<string, unknown>
          try {
            event = JSON.parse(line.slice(6))
          } catch {
            continue
          }
          if (event.type === "text") {
            setDraft((prev) => prev + ((event.text as string) ?? ""))
          } else if (event.type === "error") {
            setError((event.detail as string) ?? "Write failed.")
            break outer
          } else if (event.type === "done") {
            break outer
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reach the writing service.")
    } finally {
      setWriting(false)
    }
  }

  // ── Free tier: blurred, locked panel with an upgrade CTA ────────────────────
  if (!isPro) {
    return (
      <div className="relative h-full min-h-[420px] overflow-hidden rounded-2xl border border-line bg-cream shadow-paper">
        {/* Blurred faux-editor behind the lock */}
        <div aria-hidden className="pointer-events-none select-none p-6 blur-[3px]">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-parchment text-ink">
              <PenLine className="size-4" />
            </span>
            <h2 className="font-serif text-lg font-semibold text-ink">Your lit review</h2>
          </div>
          <div className="space-y-3">
            <div className="h-3 w-11/12 rounded bg-line" />
            <div className="h-3 w-full rounded bg-line" />
            <div className="h-3 w-10/12 rounded bg-line" />
            <div className="h-3 w-full rounded bg-line" />
            <div className="h-3 w-8/12 rounded bg-line" />
            <div className="mt-6 h-3 w-9/12 rounded bg-line" />
            <div className="h-3 w-full rounded bg-line" />
            <div className="h-3 w-7/12 rounded bg-line" />
          </div>
        </div>

        {/* Lock overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-cream/40 px-6 text-center backdrop-blur-[2px]">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-gold/15 text-gold">
            <Lock className="size-5" />
          </span>
          <div>
            <h3 className="font-serif text-xl font-semibold text-ink">Writing mode is a Pro feature</h3>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-stone">
              Draft your literature review beside your sources, insert citations in a click, and
              continue your draft with AI.
            </p>
          </div>
          <button
            type="button"
            onClick={onUpgrade}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-ink-soft"
          >
            <Sparkles className="size-4" />
            Upgrade to write
          </button>
        </div>
      </div>
    )
  }

  // ── Pro tier: the real writing surface ──────────────────────────────────────
  return (
    <div className="flex h-full min-h-[420px] flex-col rounded-2xl border border-line bg-cream p-6 shadow-paper">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-parchment text-ink">
            <PenLine className="size-4" />
          </span>
          <h2 className="font-serif text-lg font-semibold text-ink">Your lit review</h2>
        </div>
        <button
          type="button"
          onClick={writeWithAI}
          disabled={writing}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-cream transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          {writing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {writing ? "Writing…" : "Write with AI"}
        </button>
      </div>

      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Draft your literature review here. Use “Insert citation” on any paper on the left, or “Write with AI” to continue your draft from the synthesis."
        aria-label="Literature review draft"
        className="min-h-[320px] flex-1 resize-none rounded-xl border border-line bg-paper/50 p-4 text-[15px] leading-[1.7] text-body outline-none transition-colors placeholder:text-stone-light focus:border-line-strong"
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-stone-light">
          {draft.trim() ? `${draft.trim().split(/\s+/).length} words` : "Start writing…"}
        </span>
        {error && (
          <span className="text-xs text-destructive" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  )
}
