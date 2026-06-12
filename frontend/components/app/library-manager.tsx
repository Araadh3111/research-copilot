"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { BookOpen, Upload, Trash2, FileText, Lock, AlertTriangle, ArrowLeft } from "lucide-react"

import { API_BASE_URL } from "@/lib/api"
import { track } from "@/lib/analytics"
import { createClient } from "@/utils/supabase/client"

// BYO-PDF library (Task 1.3): upload PDFs you have the right to use, manage them,
// see your storage quota, and exercise data/account deletion. Uploads are private
// to you, never shared, and never used to train models.

type Doc = { id: string; title: string; filename?: string; pages?: number; chunk_count?: number }
type LibraryState = { documents: Doc[]; count: number; cap: number; tier: string }

export function LibraryManager() {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement | null>(null)

  const [state, setState] = useState<LibraryState | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const token = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }, [supabase])

  const load = useCallback(async () => {
    const t = await token()
    if (!t) return
    try {
      const res = await fetch(`${API_BASE_URL}/library`, { headers: { Authorization: `Bearer ${t}` } })
      if (res.ok) setState((await res.json()) as LibraryState)
    } catch {
      /* non-critical */
    }
  }, [token])

  useEffect(() => { load() }, [load])

  async function upload() {
    if (!file || !consent || busy) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const t = await token()
      if (!t) throw new Error("Please sign in again.")
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(`${API_BASE_URL}/library/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${t}` }, // no Content-Type — browser sets the multipart boundary
        body: form,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.message || data?.detail || `Upload failed (HTTP ${res.status}).`)
      track("pdf_uploaded", { pages: data?.pages ?? null, chunks: data?.chunk_count ?? null })
      setNotice(`Added “${data.title}”.`)
      setFile(null); setConsent(false)
      if (fileRef.current) fileRef.current.value = ""
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.")
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    const t = await token()
    if (!t) return
    await fetch(`${API_BASE_URL}/library/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } })
    await load()
  }

  async function deleteAll() {
    if (!window.confirm("Delete ALL uploaded documents? This can't be undone.")) return
    const t = await token()
    if (!t) return
    await fetch(`${API_BASE_URL}/library`, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } })
    await load()
  }

  async function deleteAccount() {
    if (!window.confirm("Permanently delete your account AND all your data (library, history, everything)? This cannot be undone.")) return
    const t = await token()
    if (!t) return
    await fetch(`${API_BASE_URL}/account`, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } })
    await supabase.auth.signOut()
    router.push("/")
  }

  const atCap = state ? state.count >= state.cap : false

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <button
        onClick={() => router.push("/")}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-stone transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Back to search
      </button>

      <div className="flex items-center gap-2.5">
        <span className="inline-flex size-9 items-center justify-center rounded-lg bg-parchment text-ink">
          <BookOpen className="size-5" />
        </span>
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink">Your library</h1>
          <p className="text-sm text-stone">
            {state ? `${state.count} of ${state.cap} papers · ${state.tier} plan` : "Loading…"}
          </p>
        </div>
      </div>

      <p className="mt-3 inline-flex items-start gap-1.5 rounded-xl border border-line bg-cream px-3.5 py-2.5 text-xs text-stone">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        Uploads are private to you, never shared with anyone, and never used to train models. Upload only
        documents you have the right to use.
      </p>

      {/* Upload */}
      <div className="mt-6 rounded-2xl border border-line bg-cream p-5">
        <h2 className="ms-label text-[11px] tracking-[0.14em] text-stone">Add a PDF</h2>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-3 block w-full text-sm text-stone file:mr-3 file:rounded-full file:border file:border-line file:bg-parchment file:px-4 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-line"
        />
        <label className="mt-3 flex items-start gap-2 text-xs text-stone">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5"
          />
          I confirm I have the right to upload this document and use it for my personal research.
        </label>
        <button
          onClick={upload}
          disabled={!file || !consent || busy || atCap}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2 text-sm font-medium text-cream transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Upload className="size-3.5" />
          {busy ? "Indexing…" : atCap ? "Library full" : "Upload"}
        </button>
        {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}
        {notice && <p className="mt-2 text-xs text-gold">{notice}</p>}
      </div>

      {/* Documents */}
      <div className="mt-6 space-y-2">
        {state && state.documents.length === 0 && (
          <p className="text-sm text-stone-light">No papers yet. Upload a PDF to start your library.</p>
        )}
        {state?.documents.map((d) => (
          <div key={d.id} className="flex items-center gap-3 rounded-xl border border-line bg-cream p-3.5">
            <FileText className="size-4 shrink-0 text-stone" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{d.title}</p>
              <p className="text-xs text-stone-light">
                {d.pages ? `${d.pages} pages · ` : ""}{d.chunk_count ?? 0} chunks
              </p>
            </div>
            <button
              onClick={() => remove(d.id)}
              aria-label={`Delete ${d.title}`}
              className="rounded-full p-1.5 text-stone-light transition-colors hover:bg-parchment hover:text-red-600"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Danger zone */}
      <div className="mt-10 rounded-2xl border border-red-300/60 bg-red-50/40 p-5 dark:bg-red-950/10">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-400">
          <AlertTriangle className="size-4" /> Danger zone
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={deleteAll}
            className="rounded-full border border-red-300 bg-cream px-4 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:text-red-400"
          >
            Delete all documents
          </button>
          <button
            onClick={deleteAccount}
            className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            Delete account &amp; all data
          </button>
        </div>
      </div>
    </div>
  )
}
