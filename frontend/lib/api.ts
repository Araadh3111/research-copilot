// Base URL for the Researca backend.
// - In production (Vercel) set NEXT_PUBLIC_API_URL to the Railway URL.
// - In local dev it falls back to the local backend at http://127.0.0.1:8000.
// NEXT_PUBLIC_ vars are inlined at build time and are safe to expose (public API).
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000"

export const SEARCH_URL = `${API_BASE_URL}/search`
