"use client"

import { useState, type ReactNode } from "react"
import { BookOpen, ExternalLink, FileText, Quote, LayoutGrid, Sparkles, Search, Download, Share2, Check, Plus } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { RandomLoader } from "@/components/loaders"
import { papersToBibtex, papersToCsv, downloadFile } from "@/lib/export"
import { API_BASE_URL } from "@/lib/api"

export type Paper = {
  paperId?: string
  title?: string
  url?: string
  year?: number | null
  citationCount?: number | null
  openAccessPdf?: { url?: string | null } | null
  authors?: { name?: string }[] | null
  venue?: string | null
  externalIds?: { DOI?: string | null } | null
  abstract?: string | null
}

// ── Helpers for the matrix heatmap + research-gap extraction ────────────────

const MISSING_TOKENS = new Set(["", "—", "–", "-", "n/a", "na", "null", "none", "tbd", "?", "unknown"])

// Flatten a rendered markdown cell down to its text so we can tell whether the
// model emitted real content or a placeholder ("—") for a missing value.
function cellText(node: ReactNode): string {
  if (node == null || node === false || node === true) return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(cellText).join("")
  const props = (node as { props?: { children?: ReactNode } }).props
  return props?.children != null ? cellText(props.children) : ""
}

function isMissingCell(node: ReactNode): boolean {
  return MISSING_TOKENS.has(cellText(node).trim().toLowerCase())
}

// Pull the bullets out of the synthesis "…Open Gaps" / "…Disagree" section so
// they can be surfaced as highlighted cards instead of buried mid-document.
function extractGaps(synthesis: string): string[] {
  const gaps: string[] = []
  let inSection = false
  for (const line of synthesis.split("\n")) {
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    if (heading) {
      const title = heading[1].toLowerCase()
      inSection = title.includes("gap") || title.includes("disagree")
      continue
    }
    if (!inSection) continue
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    if (bullet && bullet[1].trim()) {
      gaps.push(bullet[1].replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").trim())
    }
  }
  return gaps
}

type Props = {
  query: string
  papers: Paper[]
  synthesis: string
  streaming: boolean
  outputMode?: "synthesis" | "matrix"
  /** Show the "Share" button (only in the live app, not on the read-only share page). */
  shareable?: boolean
  /** When set (Pro writing mode), each paper shows an "Insert citation" button. */
  onInsertCitation?: (paper: Paper) => void
}

function numberFmt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n)
}

type ShareState = "idle" | "loading" | "copied" | "error"

export function SearchResults({ query, papers, synthesis, streaming, outputMode = "synthesis", shareable = false, onInsertCitation }: Props) {
  const hasSynthesis = synthesis.trim().length > 0
  const isMatrix = outputMode === "matrix"
  const gaps = isMatrix ? [] : extractGaps(synthesis)

  const [shareState, setShareState] = useState<ShareState>("idle")

  async function handleShare() {
    if (shareState === "loading") return
    setShareState("loading")
    try {
      const res = await fetch(`${API_BASE_URL}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, papers, synthesis, output_mode: outputMode }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.token) throw new Error("share failed")

      const url = `${window.location.origin}/share/${data.token}`
      try {
        await navigator.clipboard.writeText(url)
      } catch {
        // Clipboard blocked (e.g. insecure context) — surface the link instead.
        window.prompt("Copy your share link:", url)
      }
      setShareState("copied")
      setTimeout(() => setShareState("idle"), 2500)
    } catch {
      setShareState("error")
      setTimeout(() => setShareState("idle"), 2500)
    }
  }

  const shareLabel =
    shareState === "copied"
      ? "Link copied!"
      : shareState === "error"
        ? "Try again"
        : shareState === "loading"
          ? "Creating…"
          : "Share"

  return (
    <div className="mt-8 w-full max-w-3xl space-y-5 text-left">
      {query && (
        <p className="px-1 text-sm text-stone">
          Results for <span className="font-medium text-ink">{query}</span>
        </p>
      )}

      {/* Synthesis / Matrix card */}
      {(hasSynthesis || streaming) && (
        <div className="rounded-2xl border border-line bg-cream p-6 shadow-paper">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-parchment text-ink">
              {isMatrix ? <LayoutGrid className="size-4" /> : <Sparkles className="size-4" />}
            </span>
            <h2 className="font-serif text-lg font-semibold text-ink">
              {isMatrix ? "Comparison Matrix" : "Synthesis"}
            </h2>
            {streaming && <span className="size-1.5 animate-pulse rounded-full bg-gold" />}
          </div>

          {hasSynthesis ? (
            isMatrix ? (
              <>
                <div className="overflow-x-auto rounded-xl border border-line">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      table: ({ children }) => (
                        <table className="w-full table-fixed border-collapse text-sm">{children}</table>
                      ),
                      thead: ({ children }) => <thead>{children}</thead>,
                      tbody: ({ children }) => <tbody>{children}</tbody>,
                      th: ({ children }) => (
                        <th className="ms-label border-b border-line bg-ink px-5 py-3 text-left text-[11px] text-cream first:w-2/5 dark:bg-parchment dark:text-ink">
                          {children}
                        </th>
                      ),
                      tr: ({ children }) => (
                        <tr className="border-b border-line last:border-0 even:bg-paper/60">{children}</tr>
                      ),
                      td: ({ children }) => {
                        // Missing data = potential research gap → flag it.
                        const missing = isMissingCell(children)
                        return (
                          <td
                            className={`px-5 py-4 align-top text-[13px] leading-relaxed first:font-mono first:font-medium first:text-ink ${
                              missing
                                ? "bg-red-100 border border-red-300 text-red-400 dark:bg-red-950/30 dark:border-red-900/60"
                                : "text-stone"
                            }`}
                          >
                            {children}
                          </td>
                        )
                      },
                      a: (props) => (
                        <a {...props} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-gold/40 underline-offset-2 hover:decoration-gold" />
                      ),
                    }}
                  >
                    {synthesis}
                  </ReactMarkdown>
                </div>
                {!streaming && (
                  <p className="mt-3 px-1 text-xs text-stone">
                    🔴 Missing data = potential research gap
                  </p>
                )}
              </>
            ) : (
              <div
                className="prose max-w-none text-pretty leading-[1.7] prose-p:font-light prose-li:font-light
                  prose-headings:font-serif prose-headings:text-ink prose-headings:font-semibold
                  prose-p:text-body prose-li:text-body
                  prose-strong:text-ink prose-a:text-ink prose-a:font-medium
                  prose-a:underline prose-a:decoration-gold/40 prose-a:underline-offset-2 hover:prose-a:decoration-gold
                  prose-hr:border-line"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                  }}
                >
                  {synthesis}
                </ReactMarkdown>
              </div>
            )
          ) : (
            <div className="flex justify-center py-2" aria-label={isMatrix ? "Generating matrix" : "Generating synthesis"}>
              <RandomLoader size={96} />
            </div>
          )}

          {/* Research gaps — lifted out of the prose into highlighted cards. */}
          {!isMatrix && gaps.length > 0 && (
            <div className="mt-6 space-y-2.5">
              <div className="flex items-center gap-2">
                <Search className="size-4 text-gold" />
                <span className="ms-label text-[11px] text-stone">
                  Research Gaps
                </span>
              </div>
              {gaps.map((gap, i) => (
                <div key={i} className="flex gap-3 rounded-xl border border-gold/30 bg-gold/10 p-4">
                  <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden>
                    🔍
                  </span>
                  <div>
                    <p className="ms-label text-[10px] text-gold">
                      Research Gap
                    </p>
                    <p className="mt-1 text-[13px] italic leading-relaxed text-body">{gap}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Export toolbar — generated entirely client-side, zero API cost. */}
      {papers.length > 0 && !streaming && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          {shareable && (
            <button
              type="button"
              onClick={handleShare}
              disabled={shareState === "loading"}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-cream px-4 py-1.5 text-sm font-medium text-stone transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              {shareState === "copied" ? <Check className="size-3.5 text-gold" /> : <Share2 className="size-3.5" />}
              {shareLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              downloadFile("researca-export.bib", papersToBibtex(papers), "application/x-bibtex;charset=utf-8")
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-cream px-4 py-1.5 text-sm font-medium text-stone transition-colors hover:border-line-strong hover:text-ink"
          >
            <Download className="size-3.5" />
            Export BibTeX
          </button>
          <button
            type="button"
            onClick={() =>
              downloadFile("researca-export.csv", papersToCsv(papers, synthesis), "text/csv;charset=utf-8")
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-cream px-4 py-1.5 text-sm font-medium text-stone transition-colors hover:border-line-strong hover:text-ink"
          >
            <Download className="size-3.5" />
            Export CSV
          </button>
        </div>
      )}

      {/* Papers */}
      {papers.length > 0 && (
        <div className="rounded-2xl border border-line bg-cream p-6 shadow-paper">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-parchment text-ink">
              <BookOpen className="size-4" />
            </span>
            <h2 className="font-serif text-lg font-semibold text-ink">
              Sources <span className="font-sans text-sm font-normal text-stone">({papers.length})</span>
            </h2>
          </div>
          <div className="space-y-2.5">
            {papers.map((paper, i) => {
              const title = paper.title?.trim() || paper.url || `Paper ${i + 1}`
              const pdfUrl = paper.openAccessPdf?.url || undefined
              const authors = paper.authors
                ?.map((a) => a?.name)
                .filter((n): n is string => !!n)
                .slice(0, 3)
                .join(", ")

              const titleRow = (
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-[13px] font-medium leading-snug text-ink">{title}</span>
                  {paper.url && <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-stone-light" />}
                </div>
              )

              const footer = (
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone">
                  {typeof paper.year === "number" && (
                    <span className="rounded-md bg-parchment px-2 py-0.5 font-medium text-body">
                      {paper.year}
                    </span>
                  )}
                  {typeof paper.citationCount === "number" && (
                    <span className="inline-flex items-center gap-1">
                      <Quote className="size-3" />
                      {numberFmt(paper.citationCount)} citation{paper.citationCount === 1 ? "" : "s"}
                    </span>
                  )}
                  {pdfUrl && (
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-gold transition-colors hover:text-ink"
                    >
                      <FileText className="size-3" />
                      PDF
                    </a>
                  )}
                  {onInsertCitation && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onInsertCitation(paper)
                      }}
                      className="ml-auto inline-flex items-center gap-1 rounded-full border border-line bg-cream px-2.5 py-0.5 font-medium text-stone transition-colors hover:border-line-strong hover:text-ink"
                    >
                      <Plus className="size-3" />
                      Insert citation
                    </button>
                  )}
                </div>
              )

              const body = (
                <>
                  {titleRow}
                  {authors && <p className="mt-1.5 truncate text-xs text-stone">{authors}</p>}
                  {footer}
                </>
              )

              // Writing mode: the card holds a button, so it can't be wrapped in an
              // <a> (no nested interactive elements) — make the title the link and
              // render the card as a plain div.
              if (onInsertCitation) {
                return (
                  <div key={paper.paperId ?? i} className="rounded-xl border border-line bg-paper/50 p-4">
                    {paper.url ? (
                      <a
                        href={paper.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block transition-opacity hover:opacity-80"
                      >
                        {titleRow}
                      </a>
                    ) : (
                      titleRow
                    )}
                    {authors && <p className="mt-1.5 truncate text-xs text-stone">{authors}</p>}
                    {footer}
                  </div>
                )
              }

              return paper.url ? (
                <a
                  key={paper.paperId ?? i}
                  href={paper.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl border border-line bg-paper/50 p-4 transition-colors hover:border-line-strong hover:bg-paper"
                >
                  {body}
                </a>
              ) : (
                <div key={paper.paperId ?? i} className="rounded-xl border border-line bg-paper/50 p-4">
                  {body}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
