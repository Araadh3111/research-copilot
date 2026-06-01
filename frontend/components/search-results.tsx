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
    <div className="mt-8 w-full max-w-[680px] space-y-4 text-left">
      {query && (
        <p className="px-1 text-sm text-[#78716C]">
          Results for <span className="font-medium text-[#1C1917]">{query}</span>
        </p>
      )}

      {/* Synthesis / Matrix card */}
      {(hasSynthesis || streaming) && (
        <div className="rounded-2xl border border-[#E5E4E2] bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
              {isMatrix ? <LayoutGrid className="size-4" /> : <Sparkles className="size-4" />}
            </span>
            <h2 className="text-sm font-semibold text-[#1C1917]">
              {isMatrix ? "Comparison Matrix" : "Synthesis"}
            </h2>
            {streaming && (
              <span className="size-1.5 rounded-full bg-[#2563EB] animate-pulse" />
            )}
          </div>

          {hasSynthesis ? (
            isMatrix ? (
              <div className="overflow-x-auto rounded-xl border border-[#E5E4E2]">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    table: ({ children }) => (
                      <table className="w-full table-fixed border-collapse text-sm">{children}</table>
                    ),
                    thead: ({ children }) => <thead>{children}</thead>,
                    tbody: ({ children }) => <tbody>{children}</tbody>,
                    th: ({ children }) => (
                      <th className="border-b border-[#E5E4E2] bg-[#FAFAF9] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#78716C] first:w-2/5">
                        {children}
                      </th>
                    ),
                    tr: ({ children }) => (
                      <tr className="border-b border-[#E5E4E2] last:border-0 even:bg-[#FAFAF9]">
                        {children}
                      </tr>
                    ),
                    td: ({ children }) => (
                      <td className="px-4 py-3.5 align-top text-[13px] leading-relaxed text-[#44403C] first:font-medium first:text-[#1C1917]">
                        {children}
                      </td>
                    ),
                    a: (props) => (
                      <a {...props} target="_blank" rel="noopener noreferrer" className="text-[#2563EB] hover:text-[#1D4ED8]" />
                    ),
                  }}
                >
                  {synthesis}
                </ReactMarkdown>
              </div>
            ) : (
              <div
                className="prose prose-sm max-w-none text-pretty
                  prose-headings:text-[#1C1917] prose-headings:font-semibold
                  prose-p:text-[#44403C] prose-li:text-[#44403C]
                  prose-strong:text-[#1C1917] prose-a:text-[#2563EB]
                  prose-a:no-underline prose-a:font-medium hover:prose-a:text-[#1D4ED8]
                  prose-hr:border-[#E5E4E2]"
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
              <span className="size-1.5 rounded-full bg-[#2563EB]/50 animate-bounce [animation-delay:0ms]" />
              <span className="size-1.5 rounded-full bg-[#2563EB]/50 animate-bounce [animation-delay:150ms]" />
              <span className="size-1.5 rounded-full bg-[#2563EB]/50 animate-bounce [animation-delay:300ms]" />
            </div>
          )}
        </div>
      )}

      {/* Papers */}
      {papers.length > 0 && (
        <div className="rounded-2xl border border-[#E5E4E2] bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
              <BookOpen className="size-4" />
            </span>
            <h2 className="text-sm font-semibold text-[#1C1917]">
              Sources <span className="text-[#78716C]">({papers.length})</span>
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

              const body = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium text-[#1C1917]">{title}</span>
                    {paper.url && <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-[#A8A29E]" />}
                  </div>
                  {authors && <p className="mt-1 truncate text-xs text-[#78716C]">{authors}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#78716C]">
                    {typeof paper.year === "number" && (
                      <span className="rounded-md bg-[#F5F4F2] px-2 py-0.5 font-medium text-[#44403C]">
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
                        className="inline-flex items-center gap-1 text-[#2563EB] transition-colors hover:text-[#1D4ED8]"
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
                  className="block rounded-xl border border-[#E5E4E2] bg-[#FAFAF9] p-4 transition-colors hover:border-[#2563EB]/30 hover:bg-white"
                >
                  {body}
                </a>
              ) : (
                <div key={paper.paperId ?? i} className="rounded-xl border border-[#E5E4E2] bg-[#FAFAF9] p-4">
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
