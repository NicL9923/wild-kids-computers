import { clamp } from './math.ts';

/** A straight (not premultiplied) sRGB color with 8-bit channels, the layout ImageData uses. */
export interface Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export function rgba(r: number, g: number, b: number, a = 255): Color {
  return { r: channel(r), g: channel(g), b: channel(b), a: channel(a) };
}

function channel(value: number): number {
  return clamp(Math.round(value), 0, 255);
}

export const WHITE: Color = Object.freeze(rgba(255, 255, 255));
export const BLACK: Color = Object.freeze(rgba(0, 0, 0));
export const TRANSPARENT: Color = Object.freeze(rgba(0, 0, 0, 0));

/** Mixes two colors channel by channel. t = 0 gives a, t = 1 gives b. */
export function mixColors(a: Color, b: Color, t: number): Color {
  const u = clamp(t, 0, 1);
  return rgba(a.r + (b.r - a.r) * u, a.g + (b.g - a.g) * u, a.b + (b.b - a.b) * u, a.a + (b.a - a.a) * u);
}

/** A color from hue in turns (0 to 1 is once around the wheel), saturation, and value in 0 to 1. */
export function hsv(hue: number, saturation: number, value: number, alpha = 255): Color {
  const h = (hue - Math.floor(hue)) * 6;
  const sector = Math.floor(h);
  const f = h - sector;
  const v = value * 255;
  const p = v * (1 - saturation);
  const q = v * (1 - saturation * f);
  const t = v * (1 - saturation * (1 - f));
  switch (sector) {
    case 0:
      return rgba(v, t, p, alpha);
    case 1:
      return rgba(q, v, p, alpha);
    case 2:
      return rgba(p, v, t, alpha);
    case 3:
      return rgba(p, q, v, alpha);
    case 4:
      return rgba(t, p, v, alpha);
    default:
      return rgba(v, p, q, alpha);
  }
}

/** Hue in turns, saturation, and value in 0 to 1. A gray has hue 0 and saturation 0. */
export function toHsv(r: number, g: number, b: number): { hue: number; saturation: number; value: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const value = max / 255;
  if (delta === 0) return { hue: 0, saturation: 0, value };
  const saturation = delta / max;
  let hue: number;
  if (max === r) hue = (g - b) / delta;
  else if (max === g) hue = 2 + (b - r) / delta;
  else hue = 4 + (r - g) / delta;
  hue /= 6;
  if (hue < 0) hue += 1;
  return { hue, saturation, value };
}

/** Rounds v / 255 to the nearest integer for 0 <= v <= 65025, with integer operations only. */
export function div255(v: number): number {
  const t = v + 128;
  return (t + (t >> 8)) >> 8;
}

/**
 * Draws one color over the pixel at byte offset i with "source over" compositing.
 * alpha is the effective source alpha, 0 to 255, already multiplied by coverage.
 */
export function blendPixel(data: Uint8ClampedArray, i: number, r: number, g: number, b: number, alpha: number): void {
  if (alpha <= 0) return;
  if (alpha >= 255) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
    return;
  }
  const da = data[i + 3] ?? 0;
  const inverse = 255 - alpha;
  if (da === 255) {
    // The paint layer is opaque, so this is the path a brush takes.
    data[i] = div255(r * alpha + (data[i] ?? 0) * inverse);
    data[i + 1] = div255(g * alpha + (data[i + 1] ?? 0) * inverse);
    data[i + 2] = div255(b * alpha + (data[i + 2] ?? 0) * inverse);
    return;
  }
  // General case, scaled by 255: source weight alpha * 255, destination weight da * (255 - alpha).
  const sourceWeight = alpha * 255;
  const destWeight = da * inverse;
  const total = sourceWeight + destWeight;
  data[i] = Math.round((r * sourceWeight + (data[i] ?? 0) * destWeight) / total);
  data[i + 1] = Math.round((g * sourceWeight + (data[i + 1] ?? 0) * destWeight) / total);
  data[i + 2] = Math.round((b * sourceWeight + (data[i + 2] ?? 0) * destWeight) / total);
  data[i + 3] = Math.round(total / 255);
}
