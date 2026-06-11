/**
 * Researca mark — "The Observatory" aperture star.
 *
 * A crisp inline SVG (no image request, sharp at any size, themeable): a sharp
 * ink badge holding a thin gold aperture ring with a four-point star at its
 * centre — the telescope lens and the star it's trained on. Gold-on-ink reads
 * on every surface (light Daybreak, night Observatory, parchment /manuscript),
 * so the same lockup works everywhere. Same { size, className } API as before,
 * so all call sites keep working unchanged.
 */
export function Logo({ size = 32, className = "" }: { size?: number; className?: string }) {
  const gold = "#D4AF37"
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[6px] ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: "#0B0E14",
        boxShadow: "inset 0 0 0 1px rgba(212,175,55,0.30)",
      }}
      aria-label="Researca"
      role="img"
    >
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
        {/* aperture ring */}
        <circle cx="16" cy="16" r="9" stroke={gold} strokeOpacity="0.55" strokeWidth="1" />
        {/* four-point star — two crossed concave diamonds */}
        <path
          d="M16 5 C16.7 12.3 19.7 15.3 27 16 C19.7 16.7 16.7 19.7 16 27 C15.3 19.7 12.3 16.7 5 16 C12.3 15.3 15.3 12.3 16 5 Z"
          fill={gold}
        />
        {/* tiny bright core */}
        <circle cx="16" cy="16" r="1.4" fill="#0B0E14" />
      </svg>
    </span>
  )
}
