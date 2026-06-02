"use client"

import type { ReactNode } from "react"
import { BookOpen, ExternalLink, FileText, Quote, LayoutGrid, Sparkles, Search, Download } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { RandomLoader } from "@/components/loaders"
import { papersToBibtex, papersToCsv, downloadFile } from "@/lib/export"

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
}

function numberFmt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n)
}

export function SearchResults({ query, papers, synthesis, streaming, outputMode = "synthesis" }: Props) {
  const hasSynthesis = synthesis.trim().length > 0
  const isMatrix = outputMode === "matrix"
  const gaps = isMatrix ? [] : extractGaps(synthesis)

  return (
    <div className="mt-8 w-full max-w-3xl space-y-5 text-left">
      {query && (
        <p className="px-1 text-sm text-stone">
          Results for <span className="font-medium text-ink">{query}</span>
        </p>
      )}

      {/* Synthesis / Matrix card */}
      {(hasSynthesis || streaming) && (
        <div className="rounded-2xl border border-line bg-cream p-6 shadow-sm">
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
                        <th className="border-b border-line bg-paper px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-stone first:w-2/5">
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
                            className={`px-4 py-3.5 align-top text-[13px] leading-relaxed first:font-medium first:text-ink ${
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
                className="prose prose-sm max-w-none text-pretty leading-[1.7]
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
                <span className="text-[11px] font-semibold uppercase tracking-wider text-stone">
                  Research Gaps
                </span>
              </div>
              {gaps.map((gap, i) => (
                <div key={i} className="flex gap-3 rounded-xl border border-gold/30 bg-gold/10 p-4">
                  <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden>
                    🔍
                  </span>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gold">
                      Research Gap
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-body">{gap}</p>
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
        <div className="rounded-2xl border border-line bg-cream p-6 shadow-sm">
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

              const body = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-mono text-[13px] font-medium leading-snug text-ink">{title}</span>
                    {paper.url && <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-stone-light" />}
                  </div>
                  {authors && <p className="mt-1.5 truncate text-xs text-stone">{authors}</p>}
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
                  </div>
                </>
              )

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
