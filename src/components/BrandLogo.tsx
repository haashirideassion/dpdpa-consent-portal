import { cn } from "@/lib/utils";

const BRAND_SRC = "/DPDPA.png";
const BRAND_ALT = "DPDPA Consent Portal — Digital Personal Data Protection Act, 2023 · Compliance & Data Governance Platform";

interface BrandBannerProps {
  className?: string;
  height?: number;
  /**
   * Width-driven sizing instead of the default height-driven sizing —
   * used for the enterprise-scale login logo, where a specific desktop
   * width (e.g. 240px) matters more than a fixed height. Still scales
   * down on narrow viewports via `min(maxWidth, 70vw)` and never
   * distorts the image (height stays auto).
   */
  maxWidth?: number;
}

/**
 * DPDPA brand artwork sized like a compact application logo, with width
 * auto or height auto (depending on which sizing prop is given) so the
 * source aspect ratio is preserved and never distorted. The source file
 * is a wide banner, so this is only ever used where a small, logo-sized
 * footprint is appropriate (e.g. the login and invite screens) — not in
 * authenticated app headers, which stay text/icon based.
 */
export function BrandBanner({ className, height, maxWidth }: BrandBannerProps) {
  const style = maxWidth
    ? { width: `min(${maxWidth}px, 70vw)`, maxWidth, height: "auto" as const }
    : { height: height ?? 48, width: "auto", maxWidth: "100%" };

  return <img src={BRAND_SRC} alt={BRAND_ALT} style={style} className={cn("rounded-md", className)} />;
}
