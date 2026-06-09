"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { Lock, PenLine, ShieldCheck, Loader2, X, Monitor } from "lucide-react"

import { API_BASE_URL } from "@/lib/api"
import { createClient } from "@/utils/supabase/client"
import type { Paper } from "@/components/search-results"

type Props = {
  isPro: boolean
  synthesis: string
  papers: Paper[]
  draft: string
  setDraft: React.Dispatch<React.SetStateAction<string>>
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onUpgrade: () => void
  /** Bumped after a successful verify so the usage panel refreshes. */
  onVerified?: () => void
}

type Verdict = "accurate" | "nuanced" | "unsupported" | "error"

const VERDICT_STYLES: Record<Verdict, { dot: string; ring: string; label: string }> = {
  accurate: { dot: "bg-green-500", ring: "border-green-300 bg-green-50 dark:border-green-900/60 dark:bg-green-950/30", label: "Accurate" },
  nuanced: { dot: "bg-amber-500", ring: "border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30", label: "Nuanced" },
  unsupported: { dot: "bg-red-500", ring: "border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30", label: "Unsupported" },
  error: { dot: "bg-stone", ring: "border-line bg-cream", label: "Couldn’t verify" },
}

export function WritingPanel({ isPro, synthesis, papers, draft, setDraft, textareaRef, onUpgrade, onVerified }: Props) {
  const supabase = createClient()
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null)
  const [result, setResult] = useState<
    { loading: boolean; verdict?: Verdict; message?: string; x: number; y: number } | null
  >(null)

  // Dismiss the floating Verify button / tooltip when clicking outside them.
  useEffect(() => {
    function onDown(e: PointerEvent) {
      const t = e.target as HTMLElement | null
      if (t && t.closest("[data-verify-ui]")) return
      setSel(null)
      setResult(null)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [])

  // On mouse-up, if there's a real selection in the textarea, show the floating
  // Verify button near the pointer (textareas don't expose selection rects, so we
  // anchor to the cursor position where the drag ended).
  function handleMouseUp(e: React.MouseEvent<HTMLTextAreaElement>) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const text = draft.slice(start, end).trim()
    if (end > start && text.length >= 3) {
      setSel({ text, x: Math.min(e.clientX, window.innerWidth - 110), y: e.clientY })
      setResult(null)
    } else {
      setSel(null)
    }
  }

  async function runVerify() {
    if (!sel) return
    const claim = sel.text
    const x = Math.min(sel.x, window.innerWidth - 280)
    const y = sel.y
    setSel(null)
    setResult({ loading: true, x, y })
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch(`${API_BASE_URL}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ claim, synthesis, papers }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setResult({ loading: false, verdict: "error", message: data?.message || "Couldn’t verify this claim.", x, y })
        return
      }
      const verdict = (["accurate", "nuanced", "unsupported"].includes(data?.verdict)
        ? data.verdict
        : "nuanced") as Verdict
      setResult({ loading: false, verdict, message: data?.explanation ?? "", x, y })
      onVerified?.()
    } catch {
      setResult({ loading: false, verdict: "error", message: "Couldn’t reach the verifier. Try again.", x, y })
    }
  }

  // ── Free tier: blurred, locked panel with an upgrade CTA ────────────────────
  if (!isPro) {
    return (
      <div className="relative h-full min-h-[420px] overflow-hidden rounded-2xl border border-line bg-cream shadow-paper">
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
          </div>
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-cream/40 px-6 text-center backdrop-blur-[2px]">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-gold/15 text-gold">
            <Lock className="size-5" />
          </span>
          <div>
            <h3 className="font-serif text-xl font-semibold text-ink">Writing mode is a Pro feature</h3>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-stone">
              Draft your literature review beside your sources, insert citations in a click, and verify
              any claim against the research.
            </p>
          </div>
          <button
            type="button"
            onClick={onUpgrade}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-ink-soft"
          >
            <ShieldCheck className="size-4" />
            Upgrade to write
          </button>
        </div>
      </div>
    )
  }

  // ── Pro tier: manual writing surface with select-to-verify ──────────────────
  const style = VERDICT_STYLES[result?.verdict ?? "error"]
  return (
    <div className="flex h-full min-h-[520px] flex-col rounded-2xl border border-line bg-cream p-4 shadow-paper sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-parchment text-ink">
            <PenLine className="size-4" />
          </span>
          <h2 className="font-serif text-lg font-semibold text-ink">Your lit review</h2>
        </div>
        <span className="hidden items-center gap-1 text-xs text-stone-light sm:inline-flex">
          <ShieldCheck className="size-3.5" /> Highlight text to verify
        </span>
      </div>

      {/* The split-panel writing surface is genuinely tight on a phone; keep it
          usable but set expectations with a small, friendly inline note. */}
      <p className="mb-3 inline-flex items-center gap-1.5 self-start rounded-full border border-line bg-parchment/60 px-3 py-1 text-xs text-stone lg:hidden">
        <Monitor className="size-3" /> Best viewed on a larger screen
      </p>

      {/* A real page on a desk: tinted scroll surface holding a centred, generous
          parchment page with a comfortable reading measure and document type. */}
      <div className="flex-1 overflow-y-auto rounded-xl bg-parchment/30 p-3 sm:p-6">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setSel(null)
          }}
          onMouseUp={handleMouseUp}
          onScroll={() => setSel(null)}
          placeholder="Write your literature review here. Use “Insert citation” on any paper on the left, then highlight a sentence to verify it against your sources."
          aria-label="Literature review draft"
          className="mx-auto block min-h-[60vh] w-full max-w-[700px] resize-none rounded-lg border border-line bg-paper px-5 py-8 text-[18px] leading-[1.7] text-body shadow-paper outline-none transition-colors placeholder:text-stone-light focus:border-line-strong sm:px-12 sm:py-12"
        />
      </div>

      <div className="mt-3 px-1 text-xs text-stone-light">
        {draft.trim() ? `${draft.trim().split(/\s+/).length} words` : "Start writing…"}
      </div>

      {/* Floating "Verify" button near the selection */}
      {sel && !result && (
        <button
          type="button"
          data-verify-ui
          onClick={runVerify}
          style={{ position: "fixed", left: sel.x, top: sel.y + 10 }}
          className="z-[60] inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-cream shadow-lg transition-colors hover:bg-ink-soft"
        >
          <ShieldCheck className="size-3.5" /> Verify
        </button>
      )}

      {/* Result tooltip — green / amber / red by verdict */}
      {result && (
        <div
          data-verify-ui
          style={{ position: "fixed", left: result.x, top: result.y + 10, maxWidth: 260 }}
          className={`z-[60] rounded-xl border p-3 text-xs shadow-lg ${result.loading ? "border-line bg-cream" : style.ring}`}
        >
          {result.loading ? (
            <span className="inline-flex items-center gap-2 text-stone">
              <Loader2 className="size-3.5 animate-spin" /> Verifying…
            </span>
          ) : (
            <div className="flex items-start gap-2">
              <span className={`mt-1 size-2 shrink-0 rounded-full ${style.dot}`} />
              <div className="min-w-0">
                <p className="ms-label text-[11px] text-ink">{style.label}</p>
                <p className="mt-1 leading-relaxed text-body">{result.message}</p>
              </div>
              <button
                type="button"
                data-verify-ui
                onClick={() => setResult(null)}
                aria-label="Dismiss"
                className="ml-1 shrink-0 text-stone-light transition-colors hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
