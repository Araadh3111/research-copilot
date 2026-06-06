import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Logo } from "@/components/logo"
import { SearchResults, type Paper } from "@/components/search-results"
import { API_BASE_URL } from "@/lib/api"

export const metadata = {
  title: "Shared synthesis · Researca",
}

type SharedResult = {
  query: string
  papers: Paper[]
  synthesis: string
  output_mode?: "synthesis" | "matrix"
}

async function getShare(token: string): Promise<SharedResult | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/share/${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
    if (!res.ok) return null
    return (await res.json()) as SharedResult
  } catch {
    return null
  }
}

// Read-only public view of a shared synthesis. No auth, no search bar — just the
// result and a CTA back to the product. `params` is async in this version of Next.
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const shared = await getShare(token)

  return (
    <div className="min-h-screen bg-canvas">
      {/* Minimal header — wordmark only, links home */}
      <header className="border-b border-line bg-paper/80 backdrop-blur-sm">
        <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={30} />
            <span className="font-serif text-xl font-semibold tracking-tight text-ink">Researca</span>
          </Link>
          <span className="text-xs uppercase tracking-[0.14em] text-stone-light">Shared result</span>
        </nav>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-10 pb-24 text-center">
        {shared ? (
          <>
            <SearchResults
              query={shared.query}
              papers={shared.papers ?? []}
              synthesis={shared.synthesis ?? ""}
              streaming={false}
              outputMode={shared.output_mode === "matrix" ? "matrix" : "synthesis"}
            />

            {/* CTA back to the product */}
            <div className="mt-12 w-full max-w-3xl rounded-2xl border border-line bg-cream p-8 text-center shadow-paper">
              <h2 className="font-serif text-xl font-semibold text-ink">
                Run your own literature review in 30 seconds
              </h2>
              <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-stone">
                Researca reads 20+ papers, ranks them by relevance, and synthesizes findings with real
                citations — not hallucinations.
              </p>
              <Link
                href="/"
                className="group mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-[15px] font-medium text-cream shadow-[0_10px_30px_-10px_rgba(26,23,20,0.5)] transition-colors duration-200 hover:bg-ink-soft"
              >
                Try Researca free
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </>
        ) : (
          <div className="mt-24 w-full max-w-md rounded-2xl border border-line bg-cream p-8 text-center shadow-paper">
            <h1 className="font-serif text-2xl font-semibold text-ink">Link not found</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-stone">
              This share link is invalid or has expired.
            </p>
            <Link
              href="/"
              className="group mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-[15px] font-medium text-cream transition-colors duration-200 hover:bg-ink-soft"
            >
              Try Researca free
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
