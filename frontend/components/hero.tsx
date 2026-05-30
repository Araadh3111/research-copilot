"use client"

import type React from "react"
import { useState } from "react"
import { Search, ChevronDown, Loader2 } from "lucide-react"
import { SearchResults } from "./search-results"
import { SEARCH_URL } from "@/lib/api"

const levels = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "expert", label: "Expert" },
]

export function Hero() {
  const [query, setQuery] = useState("")
  const [level, setLevel] = useState("intermediate")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<unknown>(null)
  const [submittedQuery, setSubmittedQuery] = useState("")

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch(SEARCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, level }),
      })

      // Try to read the body once; the API may return a JSON error payload.
      const data = await res.json().catch(() => null)

      if (!res.ok) {
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

      setResult(data)
      setSubmittedQuery(query)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while contacting the research service.",
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="relative overflow-hidden px-6 pb-24 pt-20 md:pt-32">
      {/* Purple radial glow orb */}
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

        {/* Search */}
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
                className="h-12 w-full cursor-pointer appearance-none rounded-xl border border-border bg-secondary/60 pl-4 pr-10 text-sm text-foreground outline-none transition-colors hover:bg-secondary focus:border-primary sm:w-44"
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

        {error && (
          <p className="mt-4 max-w-2xl text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        {result != null && <SearchResults data={result} query={submittedQuery} />}
      </div>
    </section>
  )
}