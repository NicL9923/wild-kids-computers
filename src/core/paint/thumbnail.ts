import { createSurface, type Surface } from './surface.ts';

/**
 * Area-averaging downscale. Every target pixel is the average of the source area it covers,
 * weighted by how much of each source pixel falls inside, in premultiplied alpha. The weights
 * come from exact arithmetic on the sizes, so the result is the same everywhere. Used for
 * gallery thumbnails and for shrinking a stamp before it is placed.
 */
export function downscale(source: Surface, width: number, height: number): Surface {
  if (width > source.width || height > source.height) {
    throw new RangeError(`Cannot downscale ${source.width} by ${source.height} to a larger ${width} by ${height}.`);
  }
  const target = createSurface(width, height);
  const columns = weights(source.width, width);
  const rows = weights(source.height, height);
  // Horizontal pass into a premultiplied float buffer, one row of targets per source row.
  const horizontal = new Float64Array(width * source.height * 4);
  const data = source.data;
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < width; x++) {
      const spans = columns[x] ?? [];
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < spans.length; k += 2) {
        const i = (y * source.width + (spans[k] ?? 0)) * 4;
        const w = ((spans[k + 1] ?? 0) * (data[i + 3] ?? 0)) / 255;
        r += (data[i] ?? 0) * w;
        g += (data[i + 1] ?? 0) * w;
        b += (data[i + 2] ?? 0) * w;
        a += 255 * w;
      }
      const o = (y * width + x) * 4;
      horizontal[o] = r;
      horizontal[o + 1] = g;
      horizontal[o + 2] = b;
      horizontal[o + 3] = a;
    }
  }
  const out = target.data;
  for (let y = 0; y < height; y++) {
    const spans = rows[y] ?? [];
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < spans.length; k += 2) {
        const o = ((spans[k] ?? 0) * width + x) * 4;
        const w = spans[k + 1] ?? 0;
        r += (horizontal[o] ?? 0) * w;
        g += (horizontal[o + 1] ?? 0) * w;
        b += (horizontal[o + 2] ?? 0) * w;
        a += (horizontal[o + 3] ?? 0) * w;
      }
      const i = (y * width + x) * 4;
      if (a <= 0) continue;
      out[i] = Math.round((r * 255) / a);
      out[i + 1] = Math.round((g * 255) / a);
      out[i + 2] = Math.round((b * 255) / a);
      out[i + 3] = Math.round(a);
    }
  }
  return target;
}

/** For each target index, pairs of (source index, weight) whose weights sum to 1. */
function weights(sourceSize: number, targetSize: number): number[][] {
  const result: number[][] = [];
  for (let t = 0; t < targetSize; t++) {
    // Target pixel t covers [t * sourceSize, (t + 1) * sourceSize) / targetSize. Scaling by
    // targetSize keeps every boundary an integer, so no rounding enters the weights.
    const start = t * sourceSize;
    const end = (t + 1) * sourceSize;
    const spans: number[] = [];
    for (let s = Math.floor(start / targetSize); s * targetSize < end; s++) {
      const overlap = Math.min(end, (s + 1) * targetSize) - Math.max(start, s * targetSize);
      if (overlap > 0) spans.push(s, overlap / sourceSize);
    }
    result.push(spans);
  }
  return result;
}

/** A gallery thumbnail of a flattened picture, keeping its shape inside maxWidth by maxHeight. */
export function thumbnail(picture: Surface, maxWidth: number, maxHeight: number): Surface {
  const scale = Math.min(1, maxWidth / picture.width, maxHeight / picture.height);
  const width = Math.max(1, Math.round(picture.width * scale));
  const height = Math.max(1, Math.round(picture.height * scale));
  return downscale(picture, width, height);
}
