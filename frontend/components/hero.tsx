"use client"

import type React from "react"
import { useState } from "react"
import { Search, ChevronDown, Loader2 } from "lucide-react"
import { SearchResults, type Paper } from "./search-results"
import { SEARCH_URL } from "@/lib/api"
import { createClient } from "@/utils/supabase/client"

const levels = [
  { value: "beginner", label: "Beginner (High School)" },
  { value: "intermediate", label: "Intermediate (Undergrad)" },
  { value: "advanced", label: "Advanced (Grad)" },
  { value: "expert", label: "Expert (PhD)" },
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

export function Hero() {
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
    if (mode === outputMode || !submittedQuery || loading) return
    setOutputMode(mode)
    await runSearch(submittedQuery, level, mode)
  }

  const hasResults = papers.length > 0 || synthesis.length > 0 || streaming

  return (
    <section className="relative overflow-hidden px-6 pb-24 pt-20 md:pt-32">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/3 rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(circle at center, rgba(124,111,255,0.55) 0%, rgba(124,111,255,0.18) 35%, rgba(6,6,15,0) 70%)",
        }}
      />

      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-4 py-1.5 text-xs font-medium text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" />
          AI-powered research, reimagined
        </span>

        <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
          Research faster. Understand deeper.
        </h1>

        <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          Researca turns scattered sources into clear, synthesized answers. Ask anything and get
          rigorous, cited insights tuned to your level of expertise.
        </p>

        {/* Search form */}
        <form
          onSubmit={handleSearch}
          className="mt-10 w-full max-w-2xl rounded-2xl border border-border bg-card/80 p-2 shadow-2xl backdrop-blur"
        >
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-3 px-3">
              <Search className="size-5 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What do you want to research?"
                aria-label="Search query"
                className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div className="relative">
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                aria-label="Expertise level"
                className="h-12 w-full cursor-pointer appearance-none rounded-xl border border-border bg-secondary/60 pl-4 pr-10 text-sm text-foreground outline-none transition-colors hover:bg-secondary focus:border-primary sm:w-52"
              >
                {levels.map((l) => (
                  <option key={l.value} value={l.value} className="bg-card text-foreground">
                    {l.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              Search
            </button>
          </div>
        </form>

        {/* Remaining searches badge — only shown for logged-in tiers */}
        {quota && !quotaError && quota.tier !== "anonymous" && (
          <p className="mt-3 text-xs text-muted-foreground">
            {quota.remaining_daily} of {quota.limit_daily} searches left today
            {quota.remaining_monthly != null && quota.limit_monthly != null && (
              <span className="ml-2 opacity-60">
                · {quota.remaining_monthly} / {quota.limit_monthly} this month
              </span>
            )}
          </p>
        )}

        {/* General error */}
        {error && (
          <p className="mt-4 max-w-2xl text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        {/* Quota-exceeded wall */}
        {quotaError && (
          <div className="mt-4 w-full max-w-2xl rounded-2xl border border-border bg-card/80 p-6 text-center backdrop-blur">
            {quotaError.tier === "anonymous" ? (
              <>
                <p className="text-sm font-medium text-foreground">
                  You&apos;ve used your {LIMITS_DISPLAY.anonymous} free searches.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sign in for 10 searches per day — free, no card required.
                </p>
                <a
                  href="/auth"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Sign up for more searches →
                </a>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">
                  {quotaError.limit_type === "monthly"
                    ? "You've reached your monthly search limit."
                    : "You've reached your daily search limit."}
                </p>
                {quotaError.resets_at && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Resets {new Date(quotaError.resets_at).toLocaleString()}
                  </p>
                )}
                {quotaError.tier === "free" && (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/60 px-5 py-2.5 text-sm text-muted-foreground">
                    Upgrade to Pro — coming soon
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {hasResults && (
          <>
            <div className="mt-6 flex w-full max-w-2xl items-center gap-1 rounded-xl border border-border bg-secondary/60 p-1">
              <button
                type="button"
                onClick={() => handleModeToggle("synthesis")}
                disabled={loading}
                className={`flex-1 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                  outputMode === "synthesis"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Synthesis
              </button>
              <button
                type="button"
                onClick={() => handleModeToggle("matrix")}
                disabled={loading}
                className={`flex-1 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                  outputMode === "matrix"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Matrix
              </button>
            </div>
            <SearchResults
              query={submittedQuery}
              papers={papers}
              synthesis={synthesis}
              streaming={streaming}
              outputMode={outputMode}
            />
          </>
        )}
      </div>
    </section>
  )
}

// Used in the anonymous CTA copy — keeps it in sync with usage.py LIMITS.
const LIMITS_DISPLAY = { anonymous: 2 }
