"use client"

import { Sparkles, ListChecks, BookOpen, ExternalLink } from "lucide-react"

type Source = {
  title?: string
  url?: string
  snippet?: string
  description?: string
}

type ResultData = Record<string, unknown>

function getString(data: ResultData, keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === "string" && value.trim()) return value
  }
  return null
}

function getArray(data: ResultData, keys: string[]): unknown[] | null {
  for (const key of keys) {
    const value = data[key]
    if (Array.isArray(value) && value.length > 0) return value
  }
  return null
}

export function SearchResults({ data, query }: { data: unknown; query: string }) {
  // If the API returned a plain string, just show it as the synthesis.
  const obj: ResultData =
    typeof data === "string" ? { synthesis: data } : data && typeof data === "object" ? (data as ResultData) : {}

  const synthesis = getString(obj, ["synthesis", "answer", "summary", "result", "response", "text"])
  const rawPoints = getArray(obj, ["key_points", "keyPoints", "takeaways", "highlights", "points"])
  const keyPoints = rawPoints?.filter((p): p is string => typeof p === "string")
  const rawSources = getArray(obj, ["sources", "citations", "references", "results", "links"])

  const sources: Source[] | undefined = rawSources
    ?.map((s) => {
      if (typeof s === "string") return { url: s, title: s }
      if (s && typeof s === "object") return s as Source
      return null
    })
    .filter((s): s is Source => s !== null)

  const hasStructured = synthesis || (keyPoints && keyPoints.length) || (sources && sources.length)

  return (
    <div className="mt-8 w-full max-w-2xl space-y-4 text-left">
      {query && (
        <p className="px-1 text-sm text-muted-foreground">
          Results for <span className="font-medium text-foreground">{query}</span>
        </p>
      )}

      {/* Synthesis */}
      {synthesis && (
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-card/80 p-6 backdrop-blur">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(124,111,255,0.5) 0%, rgba(6,6,15,0) 70%)" }}
          />
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Sparkles className="size-4" />
            </span>
            <h2 className="text-sm font-semibold text-foreground">Synthesis</h2>
          </div>
          <p className="whitespace-pre-wrap text-pretty text-sm leading-relaxed text-foreground/90">{synthesis}</p>
        </div>
      )}

      {/* Key points */}
      {keyPoints && keyPoints.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/80 p-6 backdrop-blur">
          <div className="mb-4 flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <ListChecks className="size-4" />
            </span>
            <h2 className="text-sm font-semibold text-foreground">Key points</h2>
          </div>
          <ul className="space-y-3">
            {keyPoints.map((point, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-foreground/90">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <span className="text-pretty">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sources */}
      {sources && sources.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/80 p-6 backdrop-blur">
          <div className="mb-4 flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <BookOpen className="size-4" />
            </span>
            <h2 className="text-sm font-semibold text-foreground">Sources</h2>
          </div>
          <div className="space-y-2">
            {sources.map((source, i) => {
              const title = source.title || source.url || `Source ${i + 1}`
              const desc = source.snippet || source.description
              const content = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">{title}</span>
                    {source.url && <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
                  </div>
                  {desc && <p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">{desc}</p>}
                  {source.url && (
                    <p className="mt-1.5 truncate text-xs text-primary/80">{source.url}</p>
                  )}
                </>
              )
              return source.url ? (
                <a
                  key={i}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl border border-border bg-secondary/40 p-4 transition-colors hover:border-primary/40 hover:bg-secondary/70"
                >
                  {content}
                </a>
              ) : (
                <div key={i} className="rounded-xl border border-border bg-secondary/40 p-4">
                  {content}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Fallback: nothing recognizable, show prettified JSON */}
      {!hasStructured && (
        <div className="rounded-2xl border border-border bg-card/80 p-6 backdrop-blur">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Result</h2>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}