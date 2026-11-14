import { builtMapEffect } from '../../sampleMap.ts';
import { defineEffect } from '../../types.ts';

const SQRT3 = 1.7320508075688772;

/**
 * Folds the point (x, y), measured from the center, into the slice between 0 and 30 degrees,
 * and writes it to out. Twelve slices meet in the middle, each a mirror image of its neighbors.
 * Every fold is a reflection across a line through the center, so no angle is ever computed.
 */
export function foldIntoSlice(x: number, y: number, out: Float64Array): void {
  let fx = Math.abs(x);
  let fy = Math.abs(y);
  // Above 60 degrees: reflect across the 60 degree line, p' = 2 (p . u) u - p with u = (1/2, sqrt(3)/2).
  if (fy > SQRT3 * fx) {
    const dot = 0.5 * fx + (SQRT3 / 2) * fy;
    const nx = dot - fx;
    fy = SQRT3 * dot - fy;
    fx = nx;
  }
  // Above 30 degrees: reflect across the 30 degree line, u = (sqrt(3)/2, 1/2).
  if (SQRT3 * fy > fx) {
    const dot = (SQRT3 / 2) * fx + 0.5 * fy;
    const nx = SQRT3 * dot - fx;
    fy = dot - fy;
    fx = nx;
  }
  out[0] = fx;
  out[1] = fy;
}

/**
 * A kaleidoscope: one slice of the picture, from the middle toward the right, repeated twelve
 * times around the center with every other copy mirrored.
 */
export default defineEffect(
  builtMapEffect('mirrorWheel', 5, (width, height) => {
    const map = new Int32Array(width * height);
    const cx = width / 2;
    const cy = height / 2;
    // Shrink the slice so its far corner still lands on the picture.
    const scale = Math.min(1, (cx - 0.5) / Math.sqrt(cx * cx + cy * cy));
    const folded = new Float64Array(2);
    for (let y = 0, p = 0; y < height; y++) {
      for (let x = 0; x < width; x++, p++) {
        foldIntoSlice(x + 0.5 - cx, y + 0.5 - cy, folded);
        const sx = Math.min(width - 1, Math.max(0, Math.floor(cx + (folded[0] ?? 0) * scale)));
        const sy = Math.min(height - 1, Math.max(0, Math.floor(cy + (folded[1] ?? 0) * scale)));
        map[p] = sy * width + sx;
      }
    }
    return map;
  }),
);
