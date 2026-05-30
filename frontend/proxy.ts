import { type NextRequest } from "next/server"
import { updateSession } from "@/utils/supabase/middleware"

// Next.js 16 renamed "Middleware" to "Proxy". The root file is `proxy.ts` and
// the exported function is `proxy` (this replaces the old `middleware.ts`).
// It refreshes the Supabase session on every matched request.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - image files
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
