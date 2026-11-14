import type { Surface } from './surface.ts';

/**
 * Bilinear sampling with premultiplied alpha, so a transparent neighbor does not darken an edge.
 * (x, y) is in pixel-center coordinates: pixel (i, j) has its center at (i, j). Outside the
 * surface counts as transparent, which gives a placed stamp a smooth edge. Writes premultiplied
 * red, green, blue, and alpha, 0 to 255, into out.
 */
export function sampleBilinear(source: Surface, x: number, y: number, out: Float64Array): void {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  accumulate(source, x0, y0, (1 - fx) * (1 - fy), out);
  accumulate(source, x0 + 1, y0, fx * (1 - fy), out);
  accumulate(source, x0, y0 + 1, (1 - fx) * fy, out);
  accumulate(source, x0 + 1, y0 + 1, fx * fy, out);
}

function accumulate(source: Surface, x: number, y: number, weight: number, out: Float64Array): void {
  if (weight === 0 || x < 0 || y < 0 || x >= source.width || y >= source.height) return;
  const i = (y * source.width + x) * 4;
  const data = source.data;
  const alpha = ((data[i + 3] ?? 0) / 255) * weight;
  out[0] = (out[0] ?? 0) + (data[i] ?? 0) * alpha;
  out[1] = (out[1] ?? 0) + (data[i + 1] ?? 0) * alpha;
  out[2] = (out[2] ?? 0) + (data[i + 2] ?? 0) * alpha;
  out[3] = (out[3] ?? 0) + 255 * alpha;
}
