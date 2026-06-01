export function Footer() {
  return (
    <footer className="border-t border-[#E5E4E2] px-6 py-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-sm text-[#78716C]">
          Built by Araadh Singh, age 15 · Chandigarh, India · Researca © 2025
        </p>
        <div className="flex gap-5">
          <a href="#" className="text-sm text-[#78716C] transition-colors hover:text-[#1C1917]">
            Privacy Policy
          </a>
          <a href="mailto:destined4sky@gmail.com" className="text-sm text-[#78716C] transition-colors hover:text-[#1C1917]">
            Contact
          </a>
        </div>
      </div>
    </footer>
  )
}
