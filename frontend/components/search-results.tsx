"use client"

import { Sparkles, BookOpen, ExternalLink, FileText, Quote, LayoutGrid } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export type Paper = {
  paperId?: string
  title?: string
  url?: string
  year?: number | null
  citationCount?: number | null
  openAccessPdf?: { url?: string | null } | null
  authors?: { name?: string }[] | null
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

  return (
    <div className="mt-8 w-full max-w-2xl space-y-4 text-left">
      {query && (
        <p className="px-1 text-sm text-muted-foreground">
          Results for <span className="font-medium text-foreground">{query}</span>
        </p>
      )}

      {/* Synthesis / Matrix — appears as soon as first text chunk arrives */}
      {(hasSynthesis || streaming) && (
        <div className={`relative overflow-hidden rounded-2xl border p-6 ${
          isMatrix
            ? "border-gray-200 bg-white shadow-sm"
            : "border-primary/30 bg-card/80 backdrop-blur"
        }`}>
          {!isMatrix && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full opacity-40 blur-3xl"
              style={{ background: "radial-gradient(circle, rgba(124,111,255,0.5) 0%, rgba(6,6,15,0) 70%)" }}
            />
          )}
          <div className="mb-4 flex items-center gap-2">
            <span className={`inline-flex size-7 items-center justify-center rounded-lg ${
              isMatrix ? "bg-gray-100 text-gray-500" : "bg-primary/15 text-primary"
            }`}>
              {isMatrix ? <LayoutGrid className="size-4" /> : <Sparkles className="size-4" />}
            </span>
            <h2 className={`text-sm font-semibold ${isMatrix ? "text-gray-800" : "text-foreground"}`}>
              {isMatrix ? "Comparison Matrix" : "Synthesis"}
            </h2>
            {streaming && (
              <span className={`size-1.5 rounded-full animate-pulse ${isMatrix ? "bg-gray-400" : "bg-primary"}`} />
            )}
          </div>

          {hasSynthesis ? (
            isMatrix ? (
              <div className="overflow-x-auto rounded-lg border border-gray-100">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    table: ({ children }) => (
                      <table className="w-full table-fixed border-collapse text-sm">{children}</table>
                    ),
                    thead: ({ children }) => <thead>{children}</thead>,
                    tbody: ({ children }) => <tbody>{children}</tbody>,
                    th: ({ children }) => (
                      <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 bg-gray-50 border-b-2 border-gray-200 first:w-2/5">
                        {children}
                      </th>
                    ),
                    tr: ({ children }) => (
                      <tr className="border-b border-gray-100 last:border-0 even:bg-gray-50/70">
                        {children}
                      </tr>
                    ),
                    td: ({ children }) => (
                      <td className="px-4 py-3.5 align-top text-[13px] leading-relaxed text-gray-700 first:font-semibold first:text-gray-900">
                        {children}
                      </td>
                    ),
                    a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                  }}
                >
                  {synthesis}
                </ReactMarkdown>
              </div>
            ) : (
              <div
                className="prose prose-sm prose-invert max-w-none text-pretty
                  prose-headings:text-foreground prose-headings:font-semibold
                  prose-p:text-foreground/90 prose-li:text-foreground/90
                  prose-strong:text-foreground prose-a:text-primary
                  prose-a:font-medium hover:prose-a:text-primary/80"
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
            <div className="flex items-center gap-1 pt-1" aria-label={isMatrix ? "Generating matrix" : "Generating synthesis"}>
              <span className={`size-1.5 rounded-full animate-bounce [animation-delay:0ms] ${isMatrix ? "bg-gray-400/60" : "bg-primary/60"}`} />
              <span className={`size-1.5 rounded-full animate-bounce [animation-delay:150ms] ${isMatrix ? "bg-gray-400/60" : "bg-primary/60"}`} />
              <span className={`size-1.5 rounded-full animate-bounce [animation-delay:300ms] ${isMatrix ? "bg-gray-400/60" : "bg-primary/60"}`} />
            </div>
          )}
        </div>
      )}

      {/* Papers — rendered immediately when the papers event fires */}
      {papers.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/80 p-6 backdrop-blur">
          <div className="mb-4 flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <BookOpen className="size-4" />
            </span>
            <h2 className="text-sm font-semibold text-foreground">
              Sources <span className="text-muted-foreground">({papers.length})</span>
            </h2>
          </div>
          <div className="space-y-2">
            {papers.map((paper, i) => {
              const title = paper.title?.trim() || paper.url || `Paper ${i + 1}`
              const pdfUrl = paper.openAccessPdf?.url || undefined
              const authors = paper.authors
                ?.map((a) => a?.name)
                .filter((n): n is string => !!n)
                .slice(0, 3)
                .join(", ")

              const header = (
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">{title}</span>
                  {paper.url && <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
                </div>
              )

              const meta = (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {typeof paper.year === "number" && (
                    <span className="rounded-md bg-secondary/60 px-2 py-0.5 font-medium text-foreground/80">
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
                      className="inline-flex items-center gap-1 text-primary/80 transition-colors hover:text-primary"
                    >
                      <FileText className="size-3" />
                      PDF
                    </a>
                  )}
                </div>
              )

              const body = (
                <>
                  {header}
                  {authors && <p className="mt-1 truncate text-xs text-muted-foreground">{authors}</p>}
                  {meta}
                </>
              )

              return paper.url ? (
                <a
                  key={paper.paperId ?? i}
                  href={paper.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl border border-border bg-secondary/40 p-4 transition-colors hover:border-primary/40 hover:bg-secondary/70"
                >
                  {body}
                </a>
              ) : (
                <div key={paper.paperId ?? i} className="rounded-xl border border-border bg-secondary/40 p-4">
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
