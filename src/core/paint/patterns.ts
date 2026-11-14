import { BLACK, mixColors, WHITE, type Color } from './color.ts';
import { clamp } from './math.ts';
import type { PatternId } from './types.ts';

/**
 * Repeating patterns for the pattern tips and the pattern fill. Each pattern gives the
 * coverage, 0 to 1, of its foreground at a pixel. Edges are antialiased from a distance to
 * the nearest edge, and positions are in document pixels, so neighboring strokes line up.
 */

const INV_SQRT2 = Math.SQRT1_2;

/** Coverage of bands `width` wide that repeat every `period`, measured along one axis. */
function band(v: number, period: number, width: number): number {
  let t = (v - width / 2) % period;
  if (t < -period / 2) t += period;
  if (t >= period / 2) t -= period;
  return clamp(width / 2 - Math.abs(t) + 0.5, 0, 1);
}

export function patternCoverage(pattern: PatternId, x: number, y: number): number {
  const px = x + 0.5;
  const py = y + 0.5;
  switch (pattern) {
    case 'stripes':
      return band((px + py) * INV_SQRT2 + 1000, 16, 8);
    case 'checks': {
      const fx = band(px, 24, 12);
      const fy = band(py, 24, 12);
      return fx * (1 - fy) + (1 - fx) * fy;
    }
    case 'dots': {
      const row = Math.floor(py / 18);
      const offset = row % 2 === 0 ? 0 : 9;
      const cx = Math.floor((px - offset) / 18) * 18 + 9 + offset;
      const cy = row * 18 + 9;
      const distance = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
      return clamp(5.5 - distance + 0.5, 0, 1);
    }
    default: {
      // zigzag: a triangle wave 24 px long and 10 px tall. Its slope stretches distances by 1.3,
      // so the edge distance is scaled back to keep the edges as soft as the other patterns.
      const t = px / 24;
      const wave = 2 * Math.abs(t - Math.round(t));
      return band((py + 10 * wave) * 0.77, 14, 6);
    }
  }
}

/** A second tone that stands apart from the main color: lighter for dark colors, darker for light ones. */
export function partnerTone(color: Color): Color {
  const luma = (299 * color.r + 587 * color.g + 114 * color.b) / 1000;
  return luma > 170 ? mixColors(color, BLACK, 0.35) : mixColors(color, WHITE, 0.6);
}
