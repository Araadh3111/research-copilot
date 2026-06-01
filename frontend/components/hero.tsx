"use client"

import type React from "react"
import { useState } from "react"
import { Search, ChevronDown, Loader2 } from "lucide-react"
import { SearchResults, type Paper } from "./search-results"
import { SEARCH_URL } from "@/lib/api"
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
    <section className="px-6 pb-24 pt-20 md:pt-32" style={{ background: "#FAFAF9" }}>
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">

        {/* Hook label */}
        <span className="mb-5 inline-block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#2563EB]">
          Built by a 15-year-old researcher
        </span>

        <h1
          className="text-balance font-bold text-[#1C1917]"
          style={{ fontSize: "clamp(36px, 5vw, 56px)", letterSpacing: "-0.02em", lineHeight: 1.1 }}
        >
          Research faster. Understand deeper.
        </h1>

        <p className="mt-5 max-w-lg text-base leading-relaxed text-[#78716C]">
          Researca reads, ranks, and synthesizes academic papers with real citations.
          No hallucinations. No fluff.
        </p>

        {/* Search form */}
        <form onSubmit={handleSearch} className="mt-10 w-full max-w-[680px]">
          <div className="flex items-center rounded-full border border-[#E5E4E2] bg-white px-2 py-1.5 shadow-sm transition-all focus-within:border-[#2563EB]/40 focus-within:shadow-md">
            <Search className="ml-3 size-4 shrink-0 text-[#78716C]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a research question…"
              aria-label="Search query"
              className="h-10 flex-1 bg-transparent px-3 text-sm text-[#1C1917] outline-none placeholder:text-[#A8A29E]"
            />
            <div className="relative mx-1 hidden sm:block">
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                aria-label="Expertise level"
                className="h-9 cursor-pointer appearance-none rounded-full border border-[#E5E4E2] bg-[#F5F4F2] pl-3 pr-8 text-sm text-[#1C1917] outline-none transition-colors hover:bg-[#EEEDE9]"
              >
                {levels.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#78716C]" />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="ml-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-[#2563EB] px-5 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Search
            </button>
          </div>
          {/* Mobile expertise selector */}
          <div className="relative mt-2 sm:hidden">
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              aria-label="Expertise level"
              className="h-10 w-full cursor-pointer appearance-none rounded-full border border-[#E5E4E2] bg-white pl-4 pr-10 text-sm text-[#1C1917] outline-none"
            >
              {levels.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#78716C]" />
          </div>
        </form>

        {/* Quota info — neutral, not alarming */}
        {quota && !quotaError && quota.tier === "free" && (
          <p className="mt-3 text-xs text-[#A8A29E]">
            Free · {quota.remaining_monthly ?? quota.remaining_daily} of {quota.limit_monthly ?? quota.limit_daily} searches remaining
          </p>
        )}
        {!quota && !quotaError && (
          <p className="mt-3 text-xs text-[#A8A29E]">Free · 10 searches / month after sign-in</p>
        )}

        {/* General error */}
        {error && (
          <p className="mt-4 max-w-2xl text-sm text-[#DC2626]" role="alert">
            {error}
          </p>
        )}

        {/* Quota-exceeded wall */}
        {quotaError && (
          <div className="mt-4 w-full max-w-[680px] rounded-2xl border border-[#E5E4E2] bg-white p-6 text-center">
            {quotaError.tier === "anonymous" ? (
              <>
                <p className="text-sm font-medium text-[#1C1917]">
                  You&apos;ve used your {LIMITS_DISPLAY.anonymous} free searches.
                </p>
                <p className="mt-1 text-xs text-[#78716C]">
                  Sign in for 10 searches per month — free, no card required.
                </p>
                <a
                  href="/auth"
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#2563EB] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8]"
                >
                  Sign up free →
                </a>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-[#1C1917]">
                  {quotaError.limit_type === "monthly"
                    ? "You've reached your monthly search limit."
                    : "You've reached your daily search limit."}
                </p>
                {quotaError.resets_at && (
                  <p className="mt-1 text-xs text-[#78716C]">
                    Resets {new Date(quotaError.resets_at).toLocaleString()}
                  </p>
                )}
                {quotaError.tier === "free" && (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#E5E4E2] bg-[#F5F4F2] px-5 py-2 text-sm text-[#78716C]">
                    Upgrade to Pro — coming soon
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Synthesis / Matrix toggle */}
        {hasResults && (
          <>
            <div className="mt-6 inline-flex rounded-full border border-[#E5E4E2] bg-white p-1">
              <button
                type="button"
                onClick={() => handleModeToggle("synthesis")}
                disabled={loading}
                className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                  outputMode === "synthesis"
                    ? "bg-[#2563EB] text-white"
                    : "text-[#78716C] hover:text-[#1C1917]"
                }`}
              >
                Synthesis
              </button>
              <button
                type="button"
                onClick={() => handleModeToggle("matrix")}
                disabled={loading}
                className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                  outputMode === "matrix"
                    ? "bg-[#2563EB] text-white"
                    : "text-[#78716C] hover:text-[#1C1917]"
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

// Keeps in sync with usage.py LIMITS.
const LIMITS_DISPLAY = { anonymous: 2 }
