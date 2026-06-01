"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import Image from "next/image"

import { createClient } from "@/utils/supabase/client"

type NavbarProps = {
  variant?: "landing" | "app"
}

export function Navbar({ variant }: NavbarProps) {
  const router = useRouter()
  const supabase = createClient()

  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.refresh()
  }

  const isLanding = variant === "landing" || (!loading && !user)

  return (
    <header className="sticky top-0 z-50 border-b border-[#E5E4E2] bg-white">
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <a href="/" className="flex items-center gap-2.5">
          <Image src="/logo.svg" alt="Researca logo" width={28} height={28} />
          <span className="text-[15px] font-semibold tracking-tight text-[#1C1917]">Researca</span>
        </a>

        {isLanding && (
          <ul className="hidden items-center gap-7 md:flex">
            <li>
              <a href="#features" className="text-sm text-[#78716C] transition-colors hover:text-[#1C1917]">
                Features
              </a>
            </li>
            <li>
              <a href="#pricing" className="text-sm text-[#78716C] transition-colors hover:text-[#1C1917]">
                Pricing
              </a>
            </li>
          </ul>
        )}

        <div className="flex items-center gap-5">
          {loading ? null : user ? (
            <>
              <span className="hidden text-sm text-[#78716C] sm:block">{user.email}</span>
              <button
                onClick={handleLogout}
                className="text-sm text-[#78716C] transition-colors hover:text-[#1C1917]"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <a
                href="/auth"
                className="text-sm text-[#78716C] transition-colors hover:text-[#1C1917]"
              >
                Sign in
              </a>
              <a
                href="/auth"
                className="rounded-full bg-[#2563EB] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8]"
              >
                Try Free
              </a>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}
