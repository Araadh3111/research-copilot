import Image from "next/image"

/**
 * Researca brand lockup. The mark itself is gold-on-transparent, which would
 * vanish on the light parchment background — so we seat it on a small dark
 * badge that keeps the gold readable in BOTH light and dark themes. The source
 * art has generous internal whitespace, so the image is scaled up slightly and
 * clipped by the badge to make the glyph fill the frame.
 */
export function Logo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#15110B] ring-1 ring-gold/20 ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src="/logo.png"
        alt="Researca"
        width={size}
        height={size}
        priority
        className="scale-[1.45] object-contain"
      />
    </span>
  )
}
