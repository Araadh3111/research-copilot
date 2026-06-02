// Client-side export helpers — BibTeX + CSV generated entirely in the browser
// from the papers already returned by a search. Zero API calls, zero cost.

import type { Paper } from "@/components/search-results"

function lastName(author?: string): string {
  if (!author) return ""
  const parts = author.trim().split(/\s+/)
  return parts[parts.length - 1] || ""
}

// BibTeX cite key: firstAuthorLastname + year (alnum only). Falls back to a
// stable per-row id so the key is never empty.
function citeKey(paper: Paper, index: number): string {
  const ln = lastName(paper.authors?.[0]?.name).replace(/[^A-Za-z0-9]/g, "")
  const base = `${ln}${paper.year ?? ""}`
  return base || `paper${index + 1}`
}

// Strip braces that would break BibTeX parsing; collapse whitespace.
function bibClean(s?: string | null): string {
  return (s ?? "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim()
}

export function papersToBibtex(papers: Paper[]): string {
  const seen = new Map<string, number>()
  const entries = papers.map((p, i) => {
    let key = citeKey(p, i)
    // Disambiguate identical author+year keys with a, b, c… suffixes.
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    if (n > 0) key += String.fromCharCode(97 + Math.min(n - 1, 25))

    const fields: string[] = []
    if (p.title) fields.push(`  title = {${bibClean(p.title)}}`)
    const authors = (p.authors ?? []).map((a) => bibClean(a?.name)).filter(Boolean)
    if (authors.length) fields.push(`  author = {${authors.join(" and ")}}`)
    if (p.year != null) fields.push(`  year = {${p.year}}`)
    if (p.venue) fields.push(`  journal = {${bibClean(p.venue)}}`)
    const doi = p.externalIds?.DOI
    if (doi) fields.push(`  doi = {${bibClean(doi)}}`)
    if (p.url) fields.push(`  url = {${p.url}}`)

    return `@article{${key},\n${fields.join(",\n")}\n}`
  })
  return entries.join("\n\n") + "\n"
}

// Best-effort "Key Finding": find the synthesis line that references this paper
// by title (the synthesizer cites papers by title). Returns "" if none — the
// CSV cell is then left blank, exactly as specced.
export function keyFindingFor(synthesis: string, title?: string): string {
  if (!synthesis || !title) return ""
  const needle = title.trim().toLowerCase()
  if (needle.length < 6) return ""
  const probe = needle.slice(0, Math.min(needle.length, 40))
  for (const raw of synthesis.split("\n")) {
    if (raw.toLowerCase().includes(probe)) {
      return raw
        .replace(/^[\s>#*\-]+/, "") // leading bullet / heading marks
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // markdown links → text
        .replace(/[*_`]/g, "") // emphasis marks
        .trim()
    }
  }
  return ""
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function papersToCsv(papers: Paper[], synthesis: string): string {
  const header = ["Title", "Authors", "Year", "Key Finding", "URL"]
  const rows = papers.map((p) => {
    const authors = (p.authors ?? [])
      .map((a) => a?.name)
      .filter((n): n is string => !!n)
      .join("; ")
    const year = p.year != null ? String(p.year) : ""
    return [p.title ?? "", authors, year, keyFindingFor(synthesis, p.title), p.url ?? ""]
      .map((c) => csvCell(c))
      .join(",")
  })
  // CRLF + a leading BOM so Excel opens UTF-8 cleanly.
  return "﻿" + [header.join(","), ...rows].join("\r\n") + "\r\n"
}

// Trigger a client-side file download with no server round-trip.
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
