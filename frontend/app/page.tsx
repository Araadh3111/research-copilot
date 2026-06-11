import { createClient } from "@/utils/supabase/server"
import { ObservatoryLanding } from "@/components/landing/observatory-landing"
import { SearchApp } from "@/components/app/search-app"

// Server-enforced routing: the session is read on the server (cookies kept fresh
// by proxy.ts), so logged-out visitors get "The Observatory" landing (the prior
// Living Manuscript hero now lives at /manuscript, the galaxy experiment at
// /galaxy, the original marketing page at /classic) and logged-in users get the
// search interface — the wrong UI is never sent to the client, not merely hidden.
export default async function Page() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    // Best-effort tier for the initial render; SearchApp re-confirms via the
    // backend (service-role) so the Matrix gate is correct even if RLS blocks this.
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("tier")
      .eq("id", user.id)
      .maybeSingle()
    return (
      <SearchApp userEmail={user.email ?? undefined} initialTier={profile?.tier ?? "free"} />
    )
  }
  return <ObservatoryLanding />
}
