/**
 * The one pixel grid every piece of pixel art shares. An art pixel is ART stage units, and the stage scale is snapped
 * so that an art pixel covers a whole number of device pixels. Nothing draws pixel art at any other size.
 */
export const ART = 4;

export const grid = {
  /** Stage scale. */
  s: 1,
  /** Stage origin in window pixels. */
  left: 0,
  top: 0,
  /** Window pixels per art pixel. */
  px: ART,
};

/** Picks the largest stage scale that fits the window and keeps art pixels on whole device pixels. */
export function snapScale(width: number, height: number, dpr: number): number {
  const fit = Math.min(width / 1600, height / 900);
  const unit = ART * dpr;
  const k = Math.max(1, Math.floor(unit * fit));
  return k / unit;
}
