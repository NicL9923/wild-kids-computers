import type { Color } from './color.ts';
import type { Rect } from './rect.ts';

/**
 * A rectangle of straight RGBA pixels, row by row, four bytes per pixel. This is the layout of
 * ImageData, so the studio can wrap a surface's data without copying it.
 */
export interface Surface {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** The largest side a surface may have. Larger sizes are a caller bug, not a big picture. */
export const MAX_SURFACE_SIDE = 16384;

export function createSurface(width: number, height: number, fill?: Color): Surface {
  for (const [name, value] of [
    ['width', width],
    ['height', height],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > MAX_SURFACE_SIDE) {
      throw new RangeError(`Surface ${name} must be an integer from 1 to ${MAX_SURFACE_SIDE}, got ${value}.`);
    }
  }
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill !== undefined && (fill.r | fill.g | fill.b | fill.a) !== 0) {
    const pixels = new Uint32Array(data.buffer);
    // Uint32 views use the platform byte order. Write one pixel through the bytes and copy it.
    data[0] = fill.r;
    data[1] = fill.g;
    data[2] = fill.b;
    data[3] = fill.a;
    pixels.fill(pixels[0] ?? 0);
  }
  return { width, height, data };
}

/** Wraps existing RGBA bytes, such as a decoded PNG, after checking the length. */
export function surfaceFromData(width: number, height: number, data: Uint8ClampedArray | Uint8Array): Surface {
  if (data.length !== width * height * 4) {
    throw new RangeError(`Expected ${width * height * 4} bytes for ${width} by ${height} pixels, got ${data.length}.`);
  }
  const surface = createSurface(width, height);
  surface.data.set(data);
  return surface;
}

export function cloneSurface(source: Surface): Surface {
  return { width: source.width, height: source.height, data: source.data.slice() };
}

/** Copies the pixels inside rect from one surface to another of the same size. */
export function copyRect(source: Surface, target: Surface, rect: Rect): void {
  const rowBytes = rect.width * 4;
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    const start = (y * source.width + rect.x) * 4;
    target.data.set(source.data.subarray(start, start + rowBytes), start);
  }
}
