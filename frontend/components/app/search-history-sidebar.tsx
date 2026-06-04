"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Clock, Trash2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

import { createClient } from "@/utils/supabase/client"

type HistoryRow = {
  id: string
  query: string
  output_mode: "synthesis" | "matrix"
  created_at: string
}

function truncate(s: string, n = 40) {
  return s.length > n ? `${s.slice(0, n).trimEnd()}…` : s
}

/**
 * Collapsible left sidebar listing the logged-in user's recent searches.
 * Reads search_history directly via supabase-js — RLS restricts rows to the
 * caller, so no dedicated backend endpoint is needed. Refetches whenever
 * `refreshKey` changes (the parent bumps it after each completed search).
 */
export function SearchHistorySidebar({
  open,
  onToggle,
  onSelect,
  refreshKey,
}: {
  open: boolean
  onToggle: () => void
  onSelect: (query: string) => void
  refreshKey: number
}) {
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  // Never throws — a network failure on mobile sets `failed` (shows a quiet
  // retry) instead of becoming an unhandled rejection or a red error.
  const fetchHistory = useCallback(async () => {
    try {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        setLoaded(true)
        return
      }
      const { data, error } = await supabase
        .from("search_history")
        .select("id, query, output_mode, created_at")
        .order("created_at", { ascending: false })
        .limit(50)
      if (error) throw error
      setRows((data as HistoryRow[]) ?? [])
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setLoaded(true)
    }
  }, [])

  // Delete one history row. RLS ("own history delete") restricts this to the
  // caller's own rows. Optimistic: remove from the list immediately, refetch to
  // restore it if the delete actually failed.
  const deleteRow = useCallback(
    async (id: string) => {
      setRows((prev) => prev.filter((r) => r.id !== id))
      const supabase = createClient()
      const { error } = await supabase.from("search_history").delete().eq("id", id)
      if (error) fetchHistory()
    },
    [fetchHistory],
  )

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory, refreshKey])

  return (
    <aside
      style={{ width: open ? 260 : 0 }}
      className="relative z-30 shrink-0 self-start sticky top-0 h-screen transition-[width] duration-[250ms] ease-in-out"
    >
      {/* Edge toggle — sticks out past the panel so it's reachable when closed. */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={open ? "Collapse recent searches" : "Open recent searches"}
        className="absolute -right-3.5 top-24 z-40 inline-flex size-7 items-center justify-center rounded-full border border-line bg-cream text-stone shadow-sm transition-colors hover:border-line-strong hover:text-ink"
      >
        {open ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
      </button>

      {/* Panel body — clipped during the width animation; fades in once open. */}
      <div className="h-full overflow-hidden border-r border-line bg-parchment">
        <div
          className={`flex h-full w-[260px] flex-col transition-opacity duration-200 ${
            open ? "opacity-100 delay-150" : "opacity-0"
          }`}
        >
          <div className="flex items-center gap-2 px-5 pb-3 pt-6 font-serif text-[11px] font-semibold uppercase tracking-[0.14em] text-stone">
            <Clock className="size-3.5" />
            Recent Searches
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
            {loaded && failed ? (
              <div className="px-2 pt-6 text-sm leading-relaxed text-stone-light">
                <p>Couldn&apos;t load your history.</p>
                <button
                  type="button"
                  onClick={fetchHistory}
                  className="mt-2 inline-flex items-center rounded-full border border-line bg-cream px-3 py-1 text-xs font-medium text-stone transition-colors hover:border-line-strong hover:text-ink"
                >
                  Retry
                </button>
              </div>
            ) : loaded && rows.length === 0 ? (
              <p className="px-2 pt-6 text-sm leading-relaxed text-stone-light">
                Your searches will appear here
              </p>
            ) : (
              <ul className="space-y-1">
                {rows.map((row) => (
                  <li key={row.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onSelect(row.query)}
                      title={row.query}
                      className="w-full rounded-lg px-2.5 py-2 pr-8 text-left transition-colors hover:bg-cream"
                    >
                      <span className="block truncate text-sm font-medium leading-snug text-ink">
                        {truncate(row.query)}
                      </span>
                      <span className="mt-1.5 flex items-center gap-2">
                        <span
                          className={`rounded-full px-1.5 py-0.5 font-serif text-[10px] font-semibold uppercase tracking-wider ${
                            row.output_mode === "matrix"
                              ? "bg-gold/15 text-gold"
                              : "bg-line text-stone"
                          }`}
                        >
                          {row.output_mode === "matrix" ? "Matrix" : "Synthesis"}
                        </span>
                        <span className="text-[11px] text-stone-light">
                          {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                        </span>
                      </span>
                    </button>

                    {/* Little delete button — appears on hover/focus of the row. */}
                    <button
                      type="button"
                      onClick={() => deleteRow(row.id)}
                      aria-label={`Delete "${truncate(row.query, 30)}" from history`}
                      title="Delete"
                      className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-md text-stone-light opacity-0 transition-all hover:bg-line hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
