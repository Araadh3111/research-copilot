"use client"

import { useCallback, useEffect, useState } from "react"

import { API_BASE_URL } from "@/lib/api"

// Internal cost dashboard (Task 2.1). Reads GET /admin/costs from the backend,
// authenticated with the ADMIN_KEY (entered once, kept in localStorage on this
// device only — never shipped in the bundle). Shows cost-per-search p50/p95,
// daily burn, and cost broken down by pipeline stage.

type Stage = { stage: string; cost_usd: number; calls: number }
type Burn = { date: string; cost_usd: number }
type Dashboard = {
  window_days: number
  total_searches: number
  cache_hits: number
  cache_hit_rate: number
  cost_per_search: { p50: number; p95: number; mean: number }
  total_cost_usd: number
  daily_burn: Burn[]
  by_stage: Stage[]
}

const KEY_STORAGE = "researca_admin_key"
const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-cream p-5">
      <div className="ms-label text-[11px] tracking-[0.14em] text-stone">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-stone-light">{hint}</div>}
    </div>
  )
}

export function AdminCosts() {
  const [key, setKey] = useState("")
  const [days, setDays] = useState(14)
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(KEY_STORAGE) : null
    if (saved) setKey(saved)
  }, [])

  const load = useCallback(
    async (adminKey: string, windowDays: number) => {
      if (!adminKey) return
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `${API_BASE_URL}/admin/costs?days=${windowDays}&key=${encodeURIComponent(adminKey)}`,
        )
        if (res.status === 401) throw new Error("Invalid admin key.")
        if (res.status === 503) throw new Error("ADMIN_KEY is not set on the backend.")
        if (!res.ok) throw new Error(`Request failed (${res.status}).`)
        setData((await res.json()) as Dashboard)
        window.localStorage.setItem(KEY_STORAGE, adminKey)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.")
        setData(null)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const maxBurn = data ? Math.max(...data.daily_burn.map((b) => b.cost_usd), 0.0001) : 1
  const totalStageCost = data ? data.by_stage.reduce((s, x) => s + x.cost_usd, 0) || 1 : 1

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-ink">Cost dashboard</h1>
      <p className="mt-1 text-sm text-stone">Per-search LLM spend · last {days} days</p>

      <form
        className="mt-6 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          load(key, days)
        }}
      >
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Admin key"
          className="flex-1 rounded-full border border-line bg-cream px-4 py-2 text-sm text-ink outline-none focus:border-line-strong"
        />
        <select
          value={days}
          onChange={(e) => {
            const d = Number(e.target.value)
            setDays(d)
            load(key, d)
          }}
          className="rounded-full border border-line bg-cream px-3 py-2 text-sm text-ink"
        >
          {[7, 14, 30, 90].map((d) => (
            <option key={d} value={d}>
              {d}d
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-cream transition-colors hover:bg-ink-soft"
        >
          {loading ? "Loading…" : "Load"}
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-stone" role="alert">
          {error}
        </p>
      )}

      {data && (
        <div className="mt-8 space-y-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Cost / search p50" value={usd(data.cost_per_search.p50)} hint="billable median" />
            <Stat label="Cost / search p95" value={usd(data.cost_per_search.p95)} />
            <Stat label="Total spend" value={usd(data.total_cost_usd)} hint={`${data.total_searches} searches`} />
            <Stat
              label="Cache hit rate"
              value={`${Math.round(data.cache_hit_rate * 100)}%`}
              hint={`${data.cache_hits} free hits`}
            />
          </div>

          <section>
            <h2 className="ms-label text-[11px] tracking-[0.14em] text-stone">Daily burn</h2>
            <div className="mt-3 space-y-1.5">
              {data.daily_burn.length === 0 && <p className="text-sm text-stone-light">No data yet.</p>}
              {data.daily_burn.map((b) => (
                <div key={b.date} className="flex items-center gap-3 text-xs">
                  <span className="w-20 shrink-0 text-stone-light">{b.date.slice(5)}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-gold"
                      style={{ width: `${(b.cost_usd / maxBurn) * 100}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right font-medium text-ink">{usd(b.cost_usd)}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="ms-label text-[11px] tracking-[0.14em] text-stone">Cost by pipeline stage</h2>
            <div className="mt-3 space-y-1.5">
              {data.by_stage.map((s) => (
                <div key={s.stage} className="flex items-center gap-3 text-xs">
                  <span className="w-32 shrink-0 text-stone">{s.stage}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-ink"
                      style={{ width: `${(s.cost_usd / totalStageCost) * 100}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right font-medium text-ink">{usd(s.cost_usd)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
