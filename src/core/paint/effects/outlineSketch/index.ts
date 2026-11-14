import { div255 } from '../../color.ts';
import { defineEffect } from '../../types.ts';

/** Dark pencil gray with a touch of blue. */
const INK_R = 50;
const INK_G = 45;
const INK_B = 70;
/** How far colors fade toward white, so the outlines stand out like a coloring page. */
const FADE = 0.65;
const KEEP = 1 - FADE;
/** Each channel value faded, rounded the way the clamped pixel array rounds: half to even. */
const FADED = Uint8ClampedArray.from({ length: 256 }, (_, v) => 255 - (255 - v) * KEEP);
/** Edge strengths, from 0 to about 1440, where a line starts and where it is fully dark. */
const FAINT = 60;
const DARK = 260;
/** Edges are found on a copy shrunk to about this many pixels across, which also sets how thick lines are. */
const EDGE_WIDTH = 800;

/** For each full-size position along one side, the two shrunk positions around it and the weight of the second. */
interface Lookup {
  readonly first: Int32Array;
  readonly second: Int32Array;
  readonly weight: Float64Array;
}

function lookup(size: number, shrink: number, small: number): Lookup {
  const first = new Int32Array(size);
  const second = new Int32Array(size);
  const weight = new Float64Array(size);
  for (let p = 0; p < size; p++) {
    // Pixel centers: full-size pixel p sits at (p + 0.5) / shrink - 0.5 in the shrunk copy.
    const at = Math.min(small - 1, Math.max(0, (p + 0.5) / shrink - 0.5));
    const low = Math.floor(at);
    first[p] = low;
    second[p] = Math.min(small - 1, low + 1);
    weight[p] = at - low;
  }
  return { first, second, weight };
}

/**
 * Writes every pixel faded toward white into output, keeping alpha, and returns each channel as
 * seen over white paper, averaged over shrink by shrink blocks, three bytes per shrunk pixel. A
 * transparent pixel reads as white, so it never makes an edge. Both in one pass over the picture.
 */
function fadeAndShrink(
  input: Uint8ClampedArray,
  output: Uint8ClampedArray,
  width: number,
  height: number,
  shrink: number,
): Uint8Array {
  const sw = Math.ceil(width / shrink);
  const sh = Math.ceil(height / shrink);
  const value = new Uint8Array(sw * sh * 3);
  const sums = new Int32Array(sw * 3);
  // The sums slot of each column's block, so the loop below needs no division.
  const slot = new Int32Array(width);
  for (let x = 0; x < width; x++) slot[x] = Math.floor(x / shrink) * 3;
  for (let by = 0; by < sh; by++) {
    sums.fill(0);
    const bottom = Math.min(height, (by + 1) * shrink);
    for (let y = by * shrink; y < bottom; y++) {
      for (let x = 0, i = y * width * 4; x < width; x++, i += 4) {
        const s = slot[x] ?? 0;
        const r = input[i] ?? 0;
        const g = input[i + 1] ?? 0;
        const b = input[i + 2] ?? 0;
        const alpha = input[i + 3] ?? 0;
        output[i] = FADED[r] ?? 0;
        output[i + 1] = FADED[g] ?? 0;
        output[i + 2] = FADED[b] ?? 0;
        output[i + 3] = alpha;
        if (alpha === 255) {
          sums[s] = (sums[s] ?? 0) + r;
          sums[s + 1] = (sums[s + 1] ?? 0) + g;
          sums[s + 2] = (sums[s + 2] ?? 0) + b;
        } else {
          sums[s] = (sums[s] ?? 0) + 255 - div255((255 - r) * alpha);
          sums[s + 1] = (sums[s + 1] ?? 0) + 255 - div255((255 - g) * alpha);
          sums[s + 2] = (sums[s + 2] ?? 0) + 255 - div255((255 - b) * alpha);
        }
      }
    }
    const rows = bottom - by * shrink;
    for (let bx = 0, s = 0, v = by * sw * 3; bx < sw; bx++, s += 3, v += 3) {
      const count = rows * (Math.min(width, (bx + 1) * shrink) - bx * shrink);
      value[v] = Math.round((sums[s] ?? 0) / count);
      value[v + 1] = Math.round((sums[s + 1] ?? 0) / count);
      value[v + 2] = Math.round((sums[s + 2] ?? 0) / count);
    }
  }
  return value;
}

/**
 * The Sobel gradient of each channel, split into a pass along rows and a pass down columns,
 * as a line strength from 0 to 1 per pixel. The strongest channel wins, so two colors of the
 * same brightness still get a line between them. Past the border the border pixel repeats, so
 * the border itself never gets a line.
 */
function lineStrength(value: Uint8Array, width: number, height: number): Float64Array {
  // Along rows: right minus left neighbor, and left + 2 middle + right, per channel.
  const difference = new Int16Array(width * height * 3);
  const smooth = new Int16Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const left = (row + Math.max(0, x - 1)) * 3;
      const right = (row + Math.min(width - 1, x + 1)) * 3;
      const m = (row + x) * 3;
      for (let c = 0; c < 3; c++) {
        const l = value[left + c] ?? 0;
        const r = value[right + c] ?? 0;
        difference[m + c] = r - l;
        smooth[m + c] = l + 2 * (value[m + c] ?? 0) + r;
      }
    }
  }
  // Down columns.
  const line = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const up = Math.max(0, y - 1) * width * 3;
    const down = Math.min(height - 1, y + 1) * width * 3;
    const row = y * width * 3;
    for (let x = 0, m = 0; x < width; x++, m += 3) {
      let strongest = 0;
      for (let c = 0; c < 3; c++) {
        const gx = (difference[up + m + c] ?? 0) + 2 * (difference[row + m + c] ?? 0) + (difference[down + m + c] ?? 0);
        const gy = (smooth[down + m + c] ?? 0) - (smooth[up + m + c] ?? 0);
        const squared = gx * gx + gy * gy;
        if (squared > strongest) strongest = squared;
      }
      if (strongest > FAINT * FAINT) line[y * width + x] = Math.min(1, (Math.sqrt(strongest) - FAINT) / (DARK - FAINT));
    }
  }
  return line;
}

/**
 * Draws the line strength, blended up from the shrunk size, in ink over the faded picture.
 * A full-size pixel blends the shrunk pixel it falls in with neighbors at most one shrunk pixel
 * away, so only full-size pixels in or next to a shrunk pixel with a line need drawing.
 */
function drawInk(
  input: Uint8ClampedArray,
  output: Uint8ClampedArray,
  width: number,
  height: number,
  shrink: number,
  line: Float64Array,
): void {
  const sw = Math.ceil(width / shrink);
  const sh = Math.ceil(height / shrink);
  const columns = lookup(width, shrink, sw);
  const rows = lookup(height, shrink, sh);
  // Mark every shrunk pixel next to a line, so each full-size pixel near a line is drawn once.
  const near = new Uint8Array(sw * sh);
  for (let by = 0; by < sh; by++) {
    for (let bx = 0; bx < sw; bx++) {
      if ((line[by * sw + bx] ?? 0) === 0) continue;
      for (let ny = Math.max(0, by - 1); ny <= Math.min(sh - 1, by + 1); ny++) {
        near.fill(1, ny * sw + Math.max(0, bx - 1), ny * sw + Math.min(sw - 1, bx + 1) + 1);
      }
    }
  }
  for (let by = 0; by < sh; by++) {
    for (let bx = 0; bx < sw; bx++) {
      if (near[by * sw + bx] === 0) continue;
      const x1 = Math.min(width, (bx + 1) * shrink);
      const y1 = Math.min(height, (by + 1) * shrink);
      for (let y = by * shrink; y < y1; y++) {
        const top = (rows.first[y] ?? 0) * sw;
        const bottom = (rows.second[y] ?? 0) * sw;
        const fy = rows.weight[y] ?? 0;
        for (let x = bx * shrink; x < x1; x++) {
          const left = columns.first[x] ?? 0;
          const right = columns.second[x] ?? 0;
          const fx = columns.weight[x] ?? 0;
          const topLeft = line[top + left] ?? 0;
          const bottomLeft = line[bottom + left] ?? 0;
          const upper = topLeft + ((line[top + right] ?? 0) - topLeft) * fx;
          const ink = upper + (bottomLeft + ((line[bottom + right] ?? 0) - bottomLeft) * fx - upper) * fy;
          const i = (y * width + x) * 4;
          const r = 255 - (255 - (input[i] ?? 0)) * KEEP;
          const g = 255 - (255 - (input[i + 1] ?? 0)) * KEEP;
          const b = 255 - (255 - (input[i + 2] ?? 0)) * KEEP;
          // The clamped array rounds each channel, half to even, the same on every machine.
          output[i] = r + (INK_R - r) * ink;
          output[i + 1] = g + (INK_G - g) * ink;
          output[i + 2] = b + (INK_B - b) * ink;
        }
      }
    }
  }
}

/**
 * Finds the edges of everything in the picture and draws them as dark lines over a faded copy,
 * like a page from a coloring book.
 *
 * Edges come from a copy shrunk by block averaging to about 800 pixels across, so a big picture
 * costs little more than a small one and lines keep the same weight. Each step is its own small
 * function, which the JavaScript engine optimizes sooner than one long one on the first run.
 */
export default defineEffect({
  id: 'outlineSketch',
  order: 10,
  group: 'whole-picture',
  apply(source, target) {
    if (source.width !== target.width || source.height !== target.height) {
      throw new RangeError('Source and target must be the same size.');
    }
    const { width, height } = source;
    const shrink = Math.max(1, Math.round(width / EDGE_WIDTH));
    const value = fadeAndShrink(source.data, target.data, width, height, shrink);
    const line = lineStrength(value, Math.ceil(width / shrink), Math.ceil(height / shrink));
    drawInk(source.data, target.data, width, height, shrink, line);
  },
});
