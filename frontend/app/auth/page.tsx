"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import Image from "next/image"

import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type Mode = "login" | "signup"

export default function AuthPage() {
  const router = useRouter()
  const supabase = createClient()

  const [user, setUser] = useState<User | null>(null)
  const [loadingUser, setLoadingUser] = useState(true)

  const [countdown, setCountdown] = useState(3)

  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Auto-redirect to homepage 3 s after sign-in.
  useEffect(() => {
    if (!user || loadingUser) return
    setCountdown(3)
    const interval = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(interval)
          router.push("/")
        }
        return n - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [user, loadingUser, router])

  // Load the current session, and keep it in sync with auth state changes.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoadingUser(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  async function handleGoogleSignIn() {
    setPending(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      setError(error.message)
      setPending(false)
    }
    // On success the browser navigates away — no need to setPending(false).
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    setMessage(null)

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else {
        setMessage(
          "Account created. Check your inbox to confirm your email, then log in.",
        )
        setMode("login")
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        setError(error.message)
      } else {
        // Refresh server components so the navbar picks up the new session.
        router.refresh()
      }
    }

    setPending(false)
  }

  async function handleLogout() {
    setPending(true)
    await supabase.auth.signOut()
    setPassword("")
    setPending(false)
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <a href="/" className="mx-auto mb-2 flex items-center gap-2">
            <Image src="/logo.svg" alt="Researca logo" width={28} height={28} />
            <span className="text-[15px] font-semibold tracking-tight">Researca</span>
          </a>
          {loadingUser ? (
            <CardTitle>Loading…</CardTitle>
          ) : user ? (
            <>
              <CardTitle>You're signed in</CardTitle>
              <CardDescription>{user.email}</CardDescription>
            </>
          ) : (
            <>
              <CardTitle>
                {mode === "login" ? "Welcome back" : "Create your account"}
              </CardTitle>
              <CardDescription>
                {mode === "login"
                  ? "Log in with your email and password."
                  : "Sign up with your email and a password."}
              </CardDescription>
            </>
          )}
        </CardHeader>

        {!loadingUser && user ? (
          <CardContent className="flex flex-col gap-4">
            <Button
              onClick={() => router.push("/")}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Start Researching →
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Redirecting in {countdown}s…
            </p>
            <Button
              onClick={handleLogout}
              disabled={pending}
              variant="ghost"
              className="w-full"
            >
              {pending ? "Logging out…" : "Log out"}
            </Button>
          </CardContent>
        ) : (
          !loadingUser && (
            <form onSubmit={handleSubmit}>
              <CardContent className="flex flex-col gap-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  className="w-full"
                  onClick={handleGoogleSignIn}
                >
                  <svg className="mr-2 size-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continue with Google
                </Button>

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                {message && (
                  <p className="text-sm text-muted-foreground">{message}</p>
                )}

                <Button type="submit" disabled={pending} className="w-full">
                  {pending
                    ? "Please wait…"
                    : mode === "login"
                      ? "Log in"
                      : "Sign up"}
                </Button>
              </CardContent>

              <CardFooter className="justify-center pt-2">
                <button
                  type="button"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => {
                    setMode(mode === "login" ? "signup" : "login")
                    setError(null)
                    setMessage(null)
                  }}
                >
                  {mode === "login"
                    ? "Need an account? Sign up"
                    : "Already have an account? Log in"}
                </button>
              </CardFooter>
            </form>
          )
        )}
      </Card>
    </main>
  )
}
