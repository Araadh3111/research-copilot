import { LandingPage } from "@/components/landing/landing-page"

// The original marketing landing, kept as a fallback at /classic now that the new
// immersive field owns `/`. Reachable directly regardless of auth state — it still
// carries the full marketing copy and the sign-in path while the new landing is
// being built out.
export default function ClassicPage() {
  return <LandingPage />
}
