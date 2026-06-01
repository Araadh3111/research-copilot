"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { Navbar } from "@/components/navbar"
import { Hero } from "@/components/hero"
import { LandingContent } from "@/components/landing-content"
import { Footer } from "@/components/footer"

export default function Page() {
  const [authState, setAuthState] = useState<"loading" | "authed" | "anon">("loading")
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setAuthState(data.user ? "authed" : "anon")
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthState(session?.user ? "authed" : "anon")
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  if (authState === "loading") {
    return <div className="min-h-screen" style={{ background: "#FAFAF9" }} />
  }

  if (authState === "authed") {
    return (
      <main className="min-h-screen" style={{ background: "#FAFAF9" }}>
        <Navbar variant="app" />
        <Hero />
        <Footer />
      </main>
    )
  }

  return (
    <main className="min-h-screen" style={{ background: "#FAFAF9" }}>
      <Navbar variant="landing" />
      <LandingContent />
      <Footer />
    </main>
  )
}
