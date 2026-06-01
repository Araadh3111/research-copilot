"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Search, ChevronDown, Loader2, ArrowRight, Lock, Zap, X } from "lucide-react"

import { SearchResults, type Paper } from "@/components/search-results"
import { SEARCH_URL, API_BASE_URL } from "@/lib/api"
import { createClient } from "@/utils/supabase/client"

const levels = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Undergrad" },
  { value: "advanced", label: "Grad" },
  { value: "expert", label: "PhD" },
]

type QuotaInfo = {
  tier: string
  remaining_daily: number
  limit_daily: number
  remaining_monthly?: number | null
  limit_monthly?: number | null
}

type QuotaError = {
  tier: string
  limit_type: "daily" | "monthly" | "total"
  resets_at: string | null
}

export function SearchApp({ userEmail, initialTier }: { userEmail?: string; initialTier?: string }) {
  const router = useRouter()
  const supabase = createClient()

  const [query, setQuery] = useState("")
  const [level, setLevel] = useState("intermediate")
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quotaError, setQuotaError] = useState<QuotaError | null>(null)
  const [papers, setPapers] = useState<Paper[]>([])
  const [synthesis, setSynthesis] = useState("")
  const [submittedQuery, setSubmittedQuery] = useState("")
  const [quota, setQuota] = useState<QuotaInfo | null>(null)
  const [outputMode, setOutputMode] = useState<"synthesis" | "matrix">("synthesis")
  const [tier, setTier] = useState<string>(initialTier ?? "free")
  const [showUpgrade, setShowUpgrade] = useState(false)

  const isPro = tier === "pro" || tier === "lab"

  // Confirm the tier from the backend (service-role read — authoritative) so the
  // Matrix gate reflects reality even if the server-side profile read was blocked.
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const res = await fetch(`${API_BASE_URL}/auth/debug`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        if (active && typeof data?.tier === "string") setTier(data.tier)
      } catch {
        /* keep initialTier on failure */
      }
    })()
    return () => {
      active = false
    }
  }, [supabase])

  // ── API logic ported verbatim — do not change request/stream handling ──────
  async function runSearch(queryStr: string, levelStr: string, mode: "synthesis" | "matrix") {
    setLoading(true)
    setStreaming(false)
    setError(null)
    setQuotaError(null)
    setPapers([])
    setSynthesis("")

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch(SEARCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query: queryStr, level: levelStr, output_mode: mode }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)

        if (data?.error === "matrix_gated") {
          setTier((t) => (t === "pro" || t === "lab" ? "free" : t))
          setOutputMode("synthesis")
          setShowUpgrade(true)
          return
        }

        if (data?.error === "quota_exceeded") {
          setQuotaError({
            tier: data.tier ?? "anonymous",
            limit_type: data.limit_type ?? "daily",
            resets_at: data.resets_at ?? null,
          })
          return
        }

        const apiMessage =
          data && typeof data === "object"
            ? (data.detail ?? data.error ?? data.message)
            : null
        throw new Error(
          typeof apiMessage === "string" && apiMessage.trim()
            ? apiMessage
            : `Request failed (status ${res.status}).`,
        )
      }

      if (!res.body) throw new Error("No response body received.")

      setStreaming(true)
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

          if (event.type === "papers") {
            setPapers((event.papers as Paper[]) ?? [])
          } else if (event.type === "text") {
            setSynthesis((prev) => prev + ((event.text as string) ?? ""))
          } else if (event.type === "quota") {
            setQuota({
              tier: event.tier as string,
              remaining_daily: event.remaining_daily as number,
              limit_daily: event.limit_daily as number,
              remaining_monthly: event.remaining_monthly as number | null,
              limit_monthly: event.limit_monthly as number | null,
            })
            if (typeof event.tier === "string") setTier(event.tier)
          } else if (event.type === "done") {
            setStreaming(false)
            setLoading(false)
            break outer
          } else if (event.type === "error") {
            setError((event.detail as string) ?? "An error occurred.")
            setStreaming(false)
            setLoading(false)
            break outer
          }
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while contacting the research service.",
      )
      setStreaming(false)
    } finally {
      setLoading(false)
      setStreaming(false)
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setOutputMode("synthesis")
    setSubmittedQuery(query)
    await runSearch(query, level, "synthesis")
  }

  async function handleModeToggle(mode: "synthesis" | "matrix") {
    // Matrix is Pro-only — show the upgrade prompt instead of calling the API.
    if (mode === "matrix" && !isPro) {
      setShowUpgrade(true)
      return
    }
    if (mode === outputMode || !submittedQuery || loading) return
    setOutputMode(mode)
    await runSearch(submittedQuery, level, mode)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.refresh()
  }

  const hasResults = papers.length > 0 || synthesis.length > 0 || streaming
  const isUnlimited = quota?.tier === "pro" || quota?.tier === "lab"

  return (
    <div className="min-h-screen bg-paper">
      {/* App navbar */}
      <header className="sticky top-0 z-50 border-b border-line bg-paper/80 backdrop-blur-sm">
        <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <a href="/" className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="Researca" width={28} height={28} />
            <span className="font-serif text-xl font-semibold tracking-tight text-ink">Researca</span>
          </a>
          <div className="flex items-center gap-4">
            {userEmail && <span className="hidden text-sm text-stone-light sm:block">{userEmail}</span>}
            <button
              onClick={handleLogout}
              className="text-sm text-stone transition-colors hover:text-ink"
            >
              Log out
            </button>
          </div>
        </nav>
      </header>

      {/* Search area */}
      <section className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-[12vh] text-center">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink">
          What are you researching?
        </h1>
        <p className="mt-2 text-[15px] text-stone">
          Ask a question and get a cited synthesis across 20+ papers.
        </p>

        <form onSubmit={handleSearch} className="mt-7 w-full max-w-[680px]">
          <div className="flex items-center rounded-full border border-line bg-cream px-2 py-1.5 shadow-sm transition-all focus-within:border-line-strong focus-within:shadow-md">
            <Search className="ml-3 size-4 shrink-0 text-stone-light" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. CRISPR gene editing therapeutic applications"
              aria-label="Search query"
              className="h-10 flex-1 bg-transparent px-3 text-sm text-ink outline-none placeholder:text-stone-light"
            />
            <div className="relative mx-1 hidden sm:block">
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                aria-label="Expertise level"
                className="h-9 cursor-pointer appearance-none rounded-full border border-line bg-parchment pl-3 pr-8 text-sm text-ink outline-none transition-colors hover:bg-[#E4DFD3]"
              >
                {levels.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-stone" />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="ml-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-ink px-5 text-sm font-medium text-cream transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
              Search
            </button>
          </div>

          {/* Mobile expertise selector */}
          <div className="relative mt-2 sm:hidden">
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              aria-label="Expertise level"
              className="h-10 w-full cursor-pointer appearance-none rounded-full border border-line bg-cream pl-4 pr-10 text-sm text-ink outline-none"
            >
              {levels.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-stone" />
          </div>
        </form>

        {/* Quota line */}
        {!quotaError && (
          <p className="mt-3 text-xs text-stone-light">
            {isUnlimited
              ? "Unlimited searches on Pro"
              : quota
                ? `${quota.remaining_monthly ?? quota.remaining_daily} searches remaining this month`
                : "Free · 10 searches / month"}
          </p>
        )}

        {/* Privacy note */}
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-stone-light">
          <Lock className="size-3" />
          Your searches are not stored beyond 24h and never used for training.
        </p>

        {error && (
          <p className="mt-4 max-w-2xl text-sm text-[#DC2626]" role="alert">{error}</p>
        )}

        {/* Quota-exceeded wall */}
        {quotaError && (
          <div className="mt-5 w-full max-w-[680px] rounded-2xl border border-line bg-cream p-6 text-center shadow-sm">
            <p className="text-sm font-medium text-ink">
              {quotaError.limit_type === "monthly"
                ? "You've reached your monthly search limit."
                : "You've reached your daily search limit."}
            </p>
            {quotaError.resets_at && (
              <p className="mt-1 text-xs text-stone">
                Resets {new Date(quotaError.resets_at).toLocaleString()}
              </p>
            )}
            {quotaError.tier === "free" && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-parchment px-5 py-2 text-sm text-stone">
                Upgrade to Pro — coming soon
              </div>
            )}
          </div>
        )}

        {/* Synthesis / Matrix toggle */}
        {hasResults && (
          <div className="mt-6 inline-flex rounded-full border border-line bg-cream p-1">
            <button
              type="button"
              onClick={() => handleModeToggle("synthesis")}
              disabled={loading}
              className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                outputMode === "synthesis" ? "bg-ink text-cream" : "text-stone hover:text-ink"
              }`}
            >
              Synthesis
            </button>
            <div className="group relative">
              <button
                type="button"
                onClick={() => handleModeToggle("matrix")}
                disabled={loading}
                aria-disabled={!isPro}
                className={`flex items-center gap-1.5 rounded-full px-5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                  !isPro
                    ? "text-stone-light"
                    : outputMode === "matrix"
                      ? "bg-ink text-cream"
                      : "text-stone hover:text-ink"
                }`}
              >
                Matrix
                {!isPro && <Lock className="size-3" />}
              </button>
              {!isPro && (
                <span className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-cream opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100">
                  Pro feature — upgrade to unlock
                </span>
              )}
            </div>
          </div>
        )}

        {hasResults && (
          <SearchResults
            query={submittedQuery}
            papers={papers}
            synthesis={synthesis}
            streaming={streaming}
            outputMode={outputMode}
          />
        )}

        <div className="h-24" />
      </section>

      {/* Upgrade modal — shown when a non-Pro user reaches for Matrix */}
      {showUpgrade && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
          onClick={() => setShowUpgrade(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-sm rounded-2xl border border-line bg-cream p-7 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setShowUpgrade(false)}
              className="absolute right-4 top-4 text-stone-light transition-colors hover:text-ink"
            >
              <X className="size-4" />
            </button>
            <span className="mx-auto inline-flex size-11 items-center justify-center rounded-xl bg-gold/15 text-gold">
              <Zap className="size-5" />
            </span>
            <h3 className="mt-4 font-serif text-xl font-semibold text-ink">
              Comparison Matrix is a Pro feature
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-stone">
              Upgrade to Pro to compare papers side-by-side by methodology, findings, and gaps —
              plus 200 searches/month and CSV + BibTeX export.
            </p>
            <a
              href="mailto:araadh3111@gmail.com?subject=Researca%20Pro"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-ink-soft"
            >
              <Zap className="size-4" />
              Upgrade to Pro
            </a>
            <button
              type="button"
              onClick={() => setShowUpgrade(false)}
              className="mt-2 w-full rounded-full px-5 py-2 text-sm text-stone transition-colors hover:text-ink"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
