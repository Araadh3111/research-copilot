import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

// Server-side Supabase client for Server Components, Route Handlers, and
// Server Actions. `cookies()` is async in this version of Next.js, so this
// factory is async and must be awaited.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // The `setAll` method was called from a Server Component. This can
            // be ignored if the session is refreshed in Proxy (proxy.ts).
          }
        },
      },
    },
  )
}
