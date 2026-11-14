/** WCAG 2.2 contrast math for six-digit hex colors. */

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** The minimum ratio WCAG 2.2 AA asks for each use of a color pairing. */
export const MINIMUM_CONTRAST = {
  /** Body text and labels (1.4.3). */
  text: 4.5,
  /** Icons, control boundaries, focus rings, and the shapes that stand in for color (1.4.11). */
  graphic: 3,
} as const;

export type ContrastUse = keyof typeof MINIMUM_CONTRAST;

function channel(hex: string, offset: number): number {
  const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.040_45 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance as WCAG defines it, from 0 for black to 1 for white. */
export function relativeLuminance(hex: string): number {
  if (!HEX_COLOR.test(hex)) throw new TypeError(`Not a six-digit hex color: ${JSON.stringify(hex)}`);
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** The contrast ratio of two colors, from 1 to 21. Order does not matter. */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].toSorted((x, y) => y - x);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}
