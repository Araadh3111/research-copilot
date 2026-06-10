import { LibraryManager } from "@/components/app/library-manager"

// BYO-PDF library (Task 1.3): manage uploaded papers, storage quota, and data
// deletion. Auth is handled client-side via the Supabase session token.
export default function LibraryPage() {
  return <LibraryManager />
}
