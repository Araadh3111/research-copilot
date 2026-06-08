"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  ArrowRight,
  Clock,
  CornerDownLeft,
  Download,
  FileText,
  GraduationCap,
  LayoutGrid,
  Lock,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Search,
  Sparkles,
  SunMedium,
  type LucideIcon,
} from "lucide-react"

import { papersToBibtex, papersToCsv, downloadFile } from "@/lib/export"
import { createClient } from "@/utils/supabase/client"
import type { Paper } from "@/components/search-results"

/**
 * CommandPalette — Researca's ⌘K "desk console".
 *
 * The /desk landing promises a command center; this is that promise made real
 * inside the app. Open it anywhere with ⌘K / Ctrl-K (or the header chip), type a
 * question and press ↵ to launch a review, or fuzzy-search every action — switch
 * Synthesis/Matrix, set the reading level, toggle writing mode, export BibTeX /
 * CSV, flip the theme, re-run a recent review pulled live from your history.
 *
 * It owns no product logic of its own: every command calls a handler the
 * SearchApp already uses, so the palette is a pure, additive control surface —
 * nothing here can change how a search streams. Styled as the manuscript console
 * (PT-Mono prompt, gold caret, parchment surface) so it reads as one instrument.
 */

// The reading levels mirror SearchApp's <select>; kept here so the palette can
// offer each as its own command without threading the list through props.
const LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Undergrad" },
  { value: "advanced", label: "Grad" },
  { value: "expert", label: "PhD" },
] as const

export type CommandPaletteCtx = {
  /** Launch a fresh synthesis review for `query`. */
  runReview: (query: string) => void
  /** Clear the desk back to an empty search. */
  newReview: () => void
  level: string
  setLevel: (level: string) => void
  /** Whether a search has produced results (gates view/export commands). */
  hasResults: boolean
  outputMode: "synthesis" | "matrix"
  setMode: (mode: "synthesis" | "matrix") => void
  writingMode: boolean
  toggleWriting: () => void
  isPro: boolean
  papers: Paper[]
  synthesis: string
  sidebarOpen: boolean
  toggleSidebar: () => void
  logout: () => void
}

type Cmd = {
  id: string
  group: string
  title: string
  hint?: string
  keywords?: string
  icon: LucideIcon
  badge?: string
  run: () => void
}

type RecentRow = { id: string; query: string; output_mode: "synthesis" | "matrix" }

// Flip the `dark` class on <html> and persist it — same contract as ThemeToggle
// and the no-flash script in layout.tsx, so the three never drift.
function toggleTheme() {
  const dark = document.documentElement.classList.toggle("dark")
  try {
    localStorage.setItem("theme", dark ? "dark" : "light")
  } catch {
    /* storage blocked — the toggle still holds for this session */
  }
}

// AND-match: every whitespace-separated term in the query must appear somewhere
// in the command's searchable text. Empty query matches everything.
function matches(cmd: Cmd, q: string): boolean {
  const term = q.trim().toLowerCase()
  if (!term) return true
  const hay = `${cmd.title} ${cmd.keywords ?? ""} ${cmd.group}`.toLowerCase()
  return term.split(/\s+/).every((w) => hay.includes(w))
}

export function CommandPalette({
  open,
  onOpenChange,
  ctx,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ctx: CommandPaletteCtx
}) {
  const [q, setQ] = useState("")
  const [active, setActive] = useState(0)
  const [recents, setRecents] = useState<RecentRow[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Global shortcut: ⌘K / Ctrl-K toggles the palette from anywhere. preventDefault
  // stops Firefox/Chrome from hijacking it to focus the address/search bar.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  // On open: reset the prompt, focus it, lock body scroll, and pull recent
  // reviews from history (RLS scopes the rows to this user — no backend needed).
  useEffect(() => {
    if (!open) return
    setQ("")
    setActive(0)
    const t = requestAnimationFrame(() => inputRef.current?.focus())
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) return
        const { data } = await supabase
          .from("search_history")
          .select("id, query, output_mode")
          .order("created_at", { ascending: false })
          .limit(8)
        if (!cancelled && data) setRecents(data as RecentRow[])
      } catch {
        /* recents are a bonus — never block the palette on them */
      }
    })()

    return () => {
      cancelAnimationFrame(t)
      document.body.style.overflow = prevOverflow
      cancelled = true
    }
  }, [open])

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  // Run a command and dismiss the palette.
  const exec = useCallback(
    (cmd: Cmd) => {
      cmd.run()
      close()
    },
    [close],
  )

  // The static action set, rebuilt only when the bits it reads actually change.
  const baseCommands = useMemo<Cmd[]>(() => {
    const cmds: Cmd[] = []

    cmds.push({
      id: "new",
      group: "Review",
      title: "New review",
      hint: "Clear the desk",
      keywords: "reset clear blank start over",
      icon: Sparkles,
      run: ctx.newReview,
    })

    if (ctx.hasResults) {
      cmds.push({
        id: "view-synthesis",
        group: "View",
        title: "Show synthesis",
        keywords: "answer prose summary",
        icon: Sparkles,
        run: () => ctx.setMode("synthesis"),
      })
      cmds.push({
        id: "view-matrix",
        group: "View",
        title: "Show comparison matrix",
        keywords: "table compare grid columns",
        icon: LayoutGrid,
        badge: ctx.isPro ? undefined : "Pro",
        run: () => ctx.setMode("matrix"),
      })
    }

    cmds.push({
      id: "writing",
      group: "View",
      title: ctx.writingMode ? "Exit writing mode" : "Open writing mode",
      keywords: "draft write essay cite editor split",
      icon: PenLine,
      badge: ctx.isPro || ctx.writingMode ? undefined : "Pro",
      run: ctx.toggleWriting,
    })

    for (const l of LEVELS) {
      cmds.push({
        id: `level-${l.value}`,
        group: "Reading level",
        title: `Set level — ${l.label}`,
        hint: ctx.level === l.value ? "Current" : undefined,
        keywords: `audience depth ${l.value} ${l.label}`,
        icon: GraduationCap,
        run: () => ctx.setLevel(l.value),
      })
    }

    if (ctx.papers.length > 0) {
      cmds.push({
        id: "export-bibtex",
        group: "Export",
        title: "Export BibTeX",
        keywords: "cite references bib download",
        icon: FileText,
        run: () =>
          downloadFile(
            "researca-export.bib",
            papersToBibtex(ctx.papers),
            "application/x-bibtex;charset=utf-8",
          ),
      })
      cmds.push({
        id: "export-csv",
        group: "Export",
        title: "Export CSV",
        keywords: "spreadsheet sheet download data",
        icon: Download,
        run: () =>
          downloadFile(
            "researca-export.csv",
            papersToCsv(ctx.papers, ctx.synthesis),
            "text/csv;charset=utf-8",
          ),
      })
    }

    cmds.push({
      id: "sidebar",
      group: "Workspace",
      title: ctx.sidebarOpen ? "Hide recent searches" : "Show recent searches",
      keywords: "history sidebar panel",
      icon: ctx.sidebarOpen ? PanelLeftClose : PanelLeftOpen,
      run: ctx.toggleSidebar,
    })
    cmds.push({
      id: "theme",
      group: "Workspace",
      title: "Toggle light / dark",
      keywords: "theme appearance night day mode",
      icon: typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? SunMedium : Moon,
      run: toggleTheme,
    })
    cmds.push({
      id: "logout",
      group: "Account",
      title: "Log out",
      keywords: "sign out exit session",
      icon: LogOut,
      run: ctx.logout,
    })

    return cmds
  }, [ctx])

  // Assemble the visible, selectable list for the current query:
  //   [launch-review?]  →  matching actions  →  matching recent reviews
  const items = useMemo<Cmd[]>(() => {
    const term = q.trim()
    const list: Cmd[] = []

    if (term) {
      list.push({
        id: "launch",
        group: "Review",
        title: `Review “${term}”`,
        hint: "Launch synthesis",
        icon: Search,
        run: () => ctx.runReview(term),
      })
    }

    list.push(...baseCommands.filter((c) => matches(c, q)))

    for (const r of recents) {
      const cmd: Cmd = {
        id: `recent-${r.id}`,
        group: "Recent reviews",
        title: r.query,
        icon: Clock,
        keywords: "history recent again rerun",
        run: () => ctx.runReview(r.query),
      }
      // Skip the recent if it's literally what the user is typing (the launch row
      // already covers it) to avoid a confusing duplicate.
      if (matches(cmd, q) && cmd.title.trim().toLowerCase() !== term.toLowerCase()) {
        list.push(cmd)
      }
    }

    return list
  }, [q, baseCommands, recents, ctx])

  // Keep the active index in range as the list shrinks/grows under filtering.
  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(0, items.length - 1)))
  }, [items.length])

  // Keep the highlighted row scrolled into view as you arrow through.
  useEffect(() => {
    rowRefs.current[active]?.scrollIntoView({ block: "nearest" })
  }, [active])

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((i) => (items.length ? (i + 1) % items.length : 0))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const cmd = items[active]
      if (cmd) exec(cmd)
    } else if (e.key === "Escape") {
      e.preventDefault()
      close()
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-[#1A1714]/40 backdrop-blur-sm dark:bg-black/60"
            onClick={close}
            aria-hidden
          />

          {/* Console */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-cream shadow-xl"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Prompt row — the "researca ›" console line */}
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-3.5">
              <span className="font-mono text-sm font-semibold text-gold">researca ›</span>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setActive(0)
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Ask a question, or search commands…"
                aria-label="Command or research query"
                className="h-6 flex-1 bg-transparent font-mono text-[15px] text-ink outline-none placeholder:text-stone-light"
              />
              <kbd className="ms-label hidden rounded border border-line bg-parchment px-1.5 py-0.5 text-[10px] text-stone-light sm:inline">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[52vh] overflow-y-auto py-2">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-stone-light">
                  No commands match. Press{" "}
                  <span className="font-mono text-stone">↵</span> to review “{q.trim()}”.
                </p>
              ) : (
                items.map((cmd, i) => {
                  const prev = items[i - 1]
                  const showHeader = !prev || prev.group !== cmd.group
                  const Icon = cmd.icon
                  const isActive = i === active
                  return (
                    <div key={cmd.id}>
                      {showHeader && (
                        <p className="ms-label px-4 pb-1 pt-3 text-[10px] tracking-[0.18em] text-stone-light">
                          {cmd.group}
                        </p>
                      )}
                      <button
                        ref={(el) => {
                          rowRefs.current[i] = el
                        }}
                        type="button"
                        onMouseMove={() => setActive(i)}
                        onClick={() => exec(cmd)}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          isActive ? "bg-parchment" : "bg-transparent"
                        }`}
                      >
                        <span
                          className={`inline-flex size-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                            isActive
                              ? "border-gold/40 bg-gold/10 text-gold"
                              : "border-line bg-paper text-stone"
                          }`}
                        >
                          <Icon className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium text-ink">
                            {cmd.title}
                          </span>
                        </span>
                        {cmd.badge && (
                          <span className="ms-label inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] text-gold">
                            <Lock className="size-2.5" />
                            {cmd.badge}
                          </span>
                        )}
                        {cmd.hint && !cmd.badge && (
                          <span className="shrink-0 text-[11px] text-stone-light">{cmd.hint}</span>
                        )}
                        {isActive && (
                          <CornerDownLeft className="size-3.5 shrink-0 text-stone-light" />
                        )}
                      </button>
                    </div>
                  )
                })
              )}
            </div>

            {/* Footer key-hints */}
            <div className="flex items-center justify-between border-t border-line bg-paper/60 px-4 py-2.5 text-[11px] text-stone-light">
              <span className="inline-flex items-center gap-1.5">
                <ArrowRight className="size-3 -rotate-90" />
                <ArrowRight className="size-3 rotate-90" />
                navigate
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CornerDownLeft className="size-3" /> run
              </span>
              <span className="ms-label tracking-[0.16em]">⌘K to toggle</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
