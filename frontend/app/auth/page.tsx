"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { Sparkles } from "lucide-react"

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
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="size-4" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Researca</span>
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
