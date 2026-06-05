"use client"

import dynamic from "next/dynamic"

// The Three.js canvas needs a real WebGL context and `window`, so it can't be
// server-rendered; pre-rendering it would only risk a hydration mismatch. Loading
// it client-only with `ssr: false` is permitted here because this file is itself a
// Client Component (the directive above) — `ssr: false` is rejected in Server
// Components. The fallback paints the same void colour the scene uses, so there's
// no flash between the page loading and the first WebGL frame.
const GalaxyScene = dynamic(() => import("./galaxy-scene"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#04060d]" />,
})

export function GalaxyLanding() {
  return (
    <main className="fixed inset-0 overflow-hidden bg-[#04060d]">
      <GalaxyScene />
    </main>
  )
}
