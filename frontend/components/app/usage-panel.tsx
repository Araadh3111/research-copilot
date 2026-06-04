"use client"

import { useCallback, useEffect, useState } from "react"
import { BarChart3, ChevronDown } from "lucide-react"

import { API_BASE_URL } from "@/lib/api"
import { createClient } from "@/utils/supabase/client"

type Feat = { used: number; limit: number | null; remaining: number | null }
type Usage = {
  tier: string
  searches: Feat
  matrix: Feat
  verifies: Feat
}

function UsageRow({ label, feat }: { label: string; feat: Feat }) {
  // limit 0 => not available on this tier (Matrix/Verify are Pro-only).
  if (feat.limit === 0) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="text-stone">{label}</span>
        <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold">
          Pro
        </span>
      </div>
    )
  }
  const unlimited = feat.limit == null
  const pct = unlimited ? 0 : Math.min(100, Math.round((feat.used / feat.limit!) * 100))
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-stone">{label}</span>
        <span className="font-medium text-ink">
          {unlimited ? `${feat.used}` : `${feat.remaining} left`}
        </span>
      </div>
      {!unlimited && (
        <>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-stone-light">
            {feat.used} / {feat.limit} this month
          </div>
        </>
      )}
    </div>
  )
}

/** Header dropdown showing the user's three monthly quotas. Refetches when
 *  `refreshKey` changes (parent bumps it after a search or verify). */
export function UsagePanel({ refreshKey }: { refreshKey: number }) {
  const [open, setOpen] = useState(false)
  const [usage, setUsage] = useState<Usage | null>(null)

  const fetchUsage = useCallback(async () => {
    try {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const res = await fetch(`${API_BASE_URL}/usage`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) setUsage((await res.json()) as Usage)
    } catch {
      /* usage display is non-critical — stay silent on failure */
    }
  }, [])

  useEffect(() => {
    fetchUsage()
  }, [fetchUsage, refreshKey])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Usage"
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-cream px-3 py-1.5 text-sm text-stone transition-colors hover:border-line-strong hover:text-ink"
      >
        <BarChart3 className="size-3.5" />
        <span className="hidden sm:inline">Usage</span>
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          {/* Click-away backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-line bg-cream p-4 text-left shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-serif text-[11px] font-semibold uppercase tracking-[0.14em] text-stone">
                This month
              </span>
              {usage && (
                <span className="rounded-full bg-parchment px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone">
                  {usage.tier}
                </span>
              )}
            </div>
            {usage ? (
              <div className="space-y-3.5">
                <UsageRow label="Searches" feat={usage.searches} />
                <UsageRow label="Comparison Matrix" feat={usage.matrix} />
                <UsageRow label="Verifies" feat={usage.verifies} />
              </div>
            ) : (
              <p className="text-sm text-stone-light">Loading…</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
