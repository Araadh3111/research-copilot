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

// The void colour the scene paints — reused for the overlay text vignette so the
// fade is seamless. Light ink + gold are hardcoded (not theme tokens) because the
// galaxy is always a dark experience and opts out of the light/dark canvas.
const INK = "#F4EFE6"
const GOLD = "#E9C16B"

export function GalaxyLanding() {
  return (
    <main className="fixed inset-0 overflow-hidden bg-[#04060d]">
      <GalaxyScene />

      {/* Atmospheric overlay — gives the "Explore" page a reason to exist beyond
          the starfield: wordmark, a one-line premise, a CTA and a way home. The
          layer is pointer-events-none so the cursor still drives the scene's
          parallax; only the actual links re-enable pointer events. */}
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
        {/* Faint vignette so the type stays legible over bright stars. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 72% 64% at 50% 52%, rgba(4,6,13,0) 28%, rgba(4,6,13,0.62) 100%)",
          }}
        />

        {/* Top bar — wordmark + back link */}
        <header className="relative flex items-center justify-between px-6 py-5 sm:px-8">
          <a href="/" className="pointer-events-auto inline-flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid h-6 w-6 place-items-center rounded-full text-[11px]"
              style={{ backgroundColor: GOLD, color: "#04060d" }}
            >
              ✦
            </span>
            <span className="font-serif text-lg font-semibold tracking-tight" style={{ color: INK }}>
              Researca
            </span>
          </a>
          <a
            href="/"
            className="pointer-events-auto text-sm transition-opacity hover:opacity-100"
            style={{ color: INK, opacity: 0.7 }}
          >
            ← Back
          </a>
        </header>

        {/* Centred hero */}
        <div className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="ms-label text-[11px] tracking-[0.35em]" style={{ color: GOLD }}>
            A field of questions
          </p>
          <h1
            className="mt-5 max-w-2xl font-serif text-[clamp(32px,6vw,64px)] font-semibold leading-[1.06] tracking-tight"
            style={{ color: INK }}
          >
            Every paper is a star.
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed" style={{ color: INK, opacity: 0.75 }}>
            Researca reads the whole sky and brings back the few that answer your
            question — cited, never invented.
          </p>
          <a
            href="/auth"
            className="group pointer-events-auto mt-9 inline-flex items-center gap-3 rounded-full px-8 py-3.5 text-sm font-medium transition-transform duration-300 hover:-translate-y-0.5"
            style={{ backgroundColor: INK, color: "#04060d" }}
          >
            <span
              aria-hidden
              className="grid h-5 w-5 place-items-center rounded-full text-[9px] transition-transform duration-300 group-hover:rotate-12"
              style={{ backgroundColor: GOLD, color: "#04060d" }}
            >
              ✦
            </span>
            Begin researching
          </a>
        </div>

        {/* Footer cue */}
        <p
          className="relative px-6 py-5 text-center text-[11px] sm:px-8"
          style={{ color: INK, opacity: 0.4 }}
        >
          Move your cursor — the field follows.
        </p>
      </div>
    </main>
  )
}
