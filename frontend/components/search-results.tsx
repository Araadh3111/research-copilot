"use client"

import { BookOpen, ExternalLink, FileText, Quote, LayoutGrid, Sparkles } from "lucide-react"
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
                    td: ({ children }) => (
                      <td className="px-4 py-3.5 align-top text-[13px] leading-relaxed text-stone first:font-medium first:text-ink">
                        {children}
                      </td>
                    ),
                    a: (props) => (
                      <a {...props} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-gold/40 underline-offset-2 hover:decoration-gold" />
                    ),
                  }}
                >
                  {synthesis}
                </ReactMarkdown>
              </div>
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
            <div className="flex items-center gap-1 pt-1" aria-label={isMatrix ? "Generating matrix" : "Generating synthesis"}>
              <span className="size-1.5 animate-bounce rounded-full bg-gold/60 [animation-delay:0ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-gold/60 [animation-delay:150ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-gold/60 [animation-delay:300ms]" />
            </div>
          )}
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
