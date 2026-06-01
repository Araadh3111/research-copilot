import { createClient } from "@/utils/supabase/server"
import { LandingPage } from "@/components/landing/landing-page"
import { SearchApp } from "@/components/app/search-app"

// Server-enforced routing: the session is read on the server (cookies kept fresh
// by proxy.ts), so logged-out visitors are served the marketing landing page and
// logged-in users get the search interface — the wrong UI is never sent to the
// client, not merely hidden with CSS.
export default async function Page() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    return <SearchApp userEmail={user.email ?? undefined} />
  }
  return <LandingPage />
}
