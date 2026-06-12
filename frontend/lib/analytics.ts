// Lightweight product analytics (Task: instrumentation before the v2 re-test).
//
// Events go to PostHog when NEXT_PUBLIC_POSTHOG_KEY is set (REST capture
// endpoint — no SDK dependency), otherwise they fall back to Vercel Analytics,
// which is already mounted in the root layout. Every call is fire-and-forget
// and swallows failures: analytics must never break the product.
//
// Core events: signup, first_search, synthesis_viewed, citation_clicked,
// pdf_uploaded, quota_hit, return_visit.

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com"

const DISTINCT_ID_KEY = "researca_did"
const LAST_SEEN_KEY = "researca_last_seen"

function distinctId(): string {
  let id = localStorage.getItem(DISTINCT_ID_KEY)
  if (!id) {
    id = typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(DISTINCT_ID_KEY, id)
  }
  return id
}

export function track(event: string, properties?: Record<string, string | number | boolean | null>) {
  try {
    if (typeof window === "undefined") return
    if (POSTHOG_KEY) {
      void fetch(`${POSTHOG_HOST}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: POSTHOG_KEY,
          event,
          distinct_id: distinctId(),
          properties: { ...properties, $current_url: window.location.href },
        }),
        keepalive: true,
      }).catch(() => {})
    } else {
      // Fall back to Vercel Analytics custom events (already mounted in layout).
      void import("@vercel/analytics")
        .then((m) => m.track(event, properties ?? undefined))
        .catch(() => {})
    }
  } catch {
    // never let analytics break the app
  }
}

/** Fire `event` only the first time `flag` is seen on this browser. */
export function trackOnce(flag: string, event: string, properties?: Record<string, string | number | boolean | null>) {
  try {
    if (typeof window === "undefined" || localStorage.getItem(flag)) return
    localStorage.setItem(flag, "1")
    track(event, properties)
  } catch {
    // localStorage unavailable (private mode) — skip rather than crash
  }
}

/** Call on app mount: fires return_visit when the last visit was >24h ago. */
export function trackReturnVisit() {
  try {
    if (typeof window === "undefined") return
    const last = Number(localStorage.getItem(LAST_SEEN_KEY) || 0)
    const now = Date.now()
    if (last && now - last > 24 * 3600 * 1000) {
      track("return_visit", { days_away: Math.round((now - last) / (24 * 3600 * 1000)) })
    }
    localStorage.setItem(LAST_SEEN_KEY, String(now))
  } catch {
    // localStorage unavailable — skip
  }
}
