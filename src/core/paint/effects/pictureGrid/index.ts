import { defineEffect } from '../../types.ts';

const TILES = 3;

/** For each target position along one side, the position in a tile to copy from. */
function tileLookup(size: number, tile: number): Int32Array {
  const lookup = new Int32Array(size);
  for (let p = 0; p < size; p++) {
    const k = Math.floor((p * TILES) / size);
    const start = Math.ceil((k * size) / TILES);
    lookup[p] = Math.min(tile - 1, p - start);
  }
  return lookup;
}

/** Where each tile pixel's run of source pixels starts along one side. Entry i + 1 is where it ends. */
function spans(size: number, tile: number): Int32Array {
  const edges = new Int32Array(tile + 1);
  for (let i = 0; i <= tile; i++) edges[i] = Math.floor((i * size) / tile);
  return edges;
}

/**
 * Shrinks the picture and repeats it three across and three down, like a sheet of stamps.
 * Each pixel of the small copy is the average of the block of pixels it replaces, weighted by
 * alpha, so thin lines stay visible and transparent pixels do not darken anything. The sums are
 * integers, so the result is exact everywhere.
 */
export default defineEffect({
  id: 'pictureGrid',
  order: 8,
  group: 'whole-picture',
  apply(source, target) {
    if (source.width !== target.width || source.height !== target.height) {
      throw new RangeError('Source and target must be the same size.');
    }
    const { width, height } = source;
    const tileWidth = Math.max(1, Math.floor(width / TILES));
    const tileHeight = Math.max(1, Math.floor(height / TILES));
    const across = spans(width, tileWidth);
    const down = spans(height, tileHeight);
    const input = source.data;
    // Sums along each source row first: premultiplied red, green, blue, and alpha per tile column.
    const rowSums = new Int32Array(tileWidth * height * 4);
    for (let y = 0; y < height; y++) {
      for (let i = 0; i < tileWidth; i++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        const end = (y * width + (across[i + 1] ?? 0)) * 4;
        for (let s = (y * width + (across[i] ?? 0)) * 4; s < end; s += 4) {
          const alpha = input[s + 3] ?? 0;
          r += (input[s] ?? 0) * alpha;
          g += (input[s + 1] ?? 0) * alpha;
          b += (input[s + 2] ?? 0) * alpha;
          a += alpha;
        }
        const o = (y * tileWidth + i) * 4;
        rowSums[o] = r;
        rowSums[o + 1] = g;
        rowSums[o + 2] = b;
        rowSums[o + 3] = a;
      }
    }
    const small = new Uint32Array(tileWidth * tileHeight);
    const pixel = new Uint8ClampedArray(small.buffer);
    for (let j = 0; j < tileHeight; j++) {
      const top = down[j] ?? 0;
      const bottom = down[j + 1] ?? 0;
      for (let i = 0; i < tileWidth; i++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let y = top; y < bottom; y++) {
          const o = (y * tileWidth + i) * 4;
          r += rowSums[o] ?? 0;
          g += rowSums[o + 1] ?? 0;
          b += rowSums[o + 2] ?? 0;
          a += rowSums[o + 3] ?? 0;
        }
        if (a === 0) continue;
        const count = (bottom - top) * ((across[i + 1] ?? 0) - (across[i] ?? 0));
        const o = (j * tileWidth + i) * 4;
        pixel[o] = Math.round(r / a);
        pixel[o + 1] = Math.round(g / a);
        pixel[o + 2] = Math.round(b / a);
        pixel[o + 3] = Math.round(a / count);
      }
    }
    const columns = tileLookup(width, tileWidth);
    const rows = tileLookup(height, tileHeight);
    const to = new Uint32Array(target.data.buffer, target.data.byteOffset, width * height);
    for (let y = 0; y < height; y++) {
      const row = (rows[y] ?? 0) * tileWidth;
      const out = y * width;
      for (let x = 0; x < width; x++) to[out + x] = small[row + (columns[x] ?? 0)] ?? 0;
    }
  },
});
