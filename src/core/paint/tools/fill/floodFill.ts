import { blendPixel, type Color } from '../../color.ts';
import { MASK_WALL_ALPHA, type PaintDocument } from '../../document.ts';
import type { Change } from '../../history.ts';
import { clamp } from '../../math.ts';
import { patternCoverage } from '../../patterns.ts';
import { EMPTY_RECT, clipRect, growRect, type Rect } from '../../rect.ts';
import type { FillStyle } from '../../types.ts';

/**
 * Flood fill.
 *
 * The region is every pixel connected to the clicked one, through its four sides, whose color
 * is close to the clicked color and that is not a wall in the line-art mask. Four-way
 * connection means a diagonal line one pixel thick still holds the paint in.
 *
 * Two touches keep edges clean. Under the line art, the fill grows one pixel into the wall,
 * so no paper shows between the paint and a line. Next to an antialiased painted edge, the
 * pixel is unmixed: it was the old color blended with the line color, and becomes the fill
 * color blended with the same line color.
 */

/** Largest sum of the red, green, and blue differences from the clicked color that still fills. */
export const FILL_TOLERANCE = 96;

const regions = new WeakMap<PaintDocument, Uint8Array>();

function regionBuffer(doc: PaintDocument): Uint8Array {
  let region = regions.get(doc);
  if (region === undefined) {
    region = new Uint8Array(doc.width * doc.height);
    regions.set(doc, region);
  }
  return region;
}

/** Writes the fill color for pixel (x, y) into out[0..2]. */
type Shader = (x: number, y: number, out: Int32Array) => void;

function shaderFor(style: FillStyle, color: Color, seedX: number, seedY: number, bounds: Rect): Shader {
  switch (style.kind) {
    case 'solid':
      return (_x, _y, out) => {
        out[0] = color.r;
        out[1] = color.g;
        out[2] = color.b;
      };
    case 'gradient': {
      const { to } = style;
      let span: (x: number, y: number) => number;
      if (style.direction === 'vertical') {
        const height = Math.max(1, bounds.height - 1);
        span = (_x, y) => (y - bounds.y) / height;
      } else {
        const dx = Math.max(Math.abs(bounds.x - seedX), Math.abs(bounds.x + bounds.width - 1 - seedX));
        const dy = Math.max(Math.abs(bounds.y - seedY), Math.abs(bounds.y + bounds.height - 1 - seedY));
        const reach = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        span = (x, y) => Math.sqrt((x - seedX) * (x - seedX) + (y - seedY) * (y - seedY)) / reach;
      }
      return (x, y, out) => {
        const t = clamp(span(x, y), 0, 1);
        out[0] = Math.round(color.r + (to.r - color.r) * t);
        out[1] = Math.round(color.g + (to.g - color.g) * t);
        out[2] = Math.round(color.b + (to.b - color.b) * t);
      };
    }
    default: {
      const { background, pattern } = style;
      return (x, y, out) => {
        const t = patternCoverage(pattern, x, y);
        out[0] = Math.round(background.r + (color.r - background.r) * t);
        out[1] = Math.round(background.g + (color.g - background.g) * t);
        out[2] = Math.round(background.b + (color.b - background.b) * t);
      };
    }
  }
}

/**
 * Fills the region around (x, y) and returns the changed rectangle. Clicking a wall, clicking
 * off the picture, or a solid fill in the color already there changes nothing.
 */
export function floodFill(
  doc: PaintDocument,
  change: Change,
  x: number,
  y: number,
  color: Color,
  style: FillStyle,
): Rect {
  const { width, height } = doc;
  const seedX = Math.floor(x);
  const seedY = Math.floor(y);
  if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) return EMPTY_RECT;
  const data = doc.paint.data;
  const wall = doc.mask?.data;
  const seed = seedY * width + seedX;
  if (wall !== undefined && (wall[seed * 4 + 3] ?? 0) >= MASK_WALL_ALPHA) return EMPTY_RECT;
  const sr = data[seed * 4] ?? 0;
  const sg = data[seed * 4 + 1] ?? 0;
  const sb = data[seed * 4 + 2] ?? 0;
  if (style.kind === 'solid' && color.a === 255 && color.r === sr && color.g === sg && color.b === sb) {
    return EMPTY_RECT;
  }

  const region = regionBuffer(doc);
  const inside = (p: number): boolean => {
    if (region[p] === 1) return false;
    if (wall !== undefined && (wall[p * 4 + 3] ?? 0) >= MASK_WALL_ALPHA) return false;
    const i = p * 4;
    const distance =
      Math.abs((data[i] ?? 0) - sr) + Math.abs((data[i + 1] ?? 0) - sg) + Math.abs((data[i + 2] ?? 0) - sb);
    return distance <= FILL_TOLERANCE;
  };

  // Scanline flood: fill a whole run, then look for runs in the rows above and below it.
  let minX = seedX;
  let maxX = seedX;
  let minY = seedY;
  let maxY = seedY;
  const stack: number[] = [seedX, seedY];
  while (stack.length > 0) {
    const ry = stack.pop() ?? 0;
    const rx = stack.pop() ?? 0;
    const row = ry * width;
    if (!inside(row + rx)) continue;
    let left = rx;
    while (left > 0 && inside(row + left - 1)) left--;
    let right = rx;
    while (right < width - 1 && inside(row + right + 1)) right++;
    region.fill(1, row + left, row + right + 1);
    if (left < minX) minX = left;
    if (right > maxX) maxX = right;
    if (ry < minY) minY = ry;
    if (ry > maxY) maxY = ry;
    for (const ny of [ry - 1, ry + 1]) {
      if (ny < 0 || ny >= height) continue;
      const nrow = ny * width;
      let inRun = false;
      for (let nx = left; nx <= right; nx++) {
        const open = inside(nrow + nx);
        if (open && !inRun) stack.push(nx, ny);
        inRun = open;
      }
    }
  }

  const bounds = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const area = clipRect(growRect(bounds, 1), width, height);
  change.touch(area);
  const shade = shaderFor(style, color, seedX, seedY, bounds);
  const fill = new Int32Array(3);
  const alpha = color.a;

  // Edge pixels first, while every neighbor still has its old color.
  const edges: number[] = [];
  for (let py = area.y; py < area.y + area.height; py++) {
    for (let px = area.x; px < area.x + area.width; px++) {
      const p = py * width + px;
      if (region[p] === 1 || !touchesRegion(region, px, py, width, height)) continue;
      shade(px, py, fill);
      const fr = fill[0] ?? 0;
      const fg = fill[1] ?? 0;
      const fb = fill[2] ?? 0;
      if (wall !== undefined && (wall[p * 4 + 3] ?? 0) >= MASK_WALL_ALPHA) {
        edges.push(p, fr, fg, fb, alpha);
        continue;
      }
      // The pixel is the old color S blended with some edge color L by an unknown amount c.
      // Take L from the neighbor least like S, and c from where the pixel sits between them.
      const i = p * 4;
      const pr = data[i] ?? 0;
      const pg = data[i + 1] ?? 0;
      const pb = data[i + 2] ?? 0;
      let lr = pr;
      let lg = pg;
      let lb = pb;
      let farthest = -1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const q = ny * width + nx;
          if (region[q] === 1) continue;
          const j = q * 4;
          const d =
            Math.abs((data[j] ?? 0) - sr) + Math.abs((data[j + 1] ?? 0) - sg) + Math.abs((data[j + 2] ?? 0) - sb);
          if (d > farthest) {
            farthest = d;
            lr = data[j] ?? 0;
            lg = data[j + 1] ?? 0;
            lb = data[j + 2] ?? 0;
          }
        }
      }
      const er = lr - sr;
      const eg = lg - sg;
      const eb = lb - sb;
      const lengthSquared = er * er + eg * eg + eb * eb;
      if (lengthSquared === 0) continue;
      const c = clamp(((pr - sr) * er + (pg - sg) * eg + (pb - sb) * eb) / lengthSquared, 0, 1);
      if (c >= 1) continue;
      const keep = 1 - c;
      const mixAlpha = Math.round(alpha * keep);
      edges.push(
        p,
        clamp(Math.round(pr + (fr - sr) * keep), 0, 255),
        clamp(Math.round(pg + (fg - sg) * keep), 0, 255),
        clamp(Math.round(pb + (fb - sb) * keep), 0, 255),
        alpha === 255 ? 255 : mixAlpha,
      );
    }
  }

  for (let py = bounds.y; py < bounds.y + bounds.height; py++) {
    const row = py * width;
    for (let px = bounds.x; px < bounds.x + bounds.width; px++) {
      const p = row + px;
      if (region[p] !== 1) continue;
      region[p] = 0;
      shade(px, py, fill);
      blendPixel(data, p * 4, fill[0] ?? 0, fill[1] ?? 0, fill[2] ?? 0, alpha);
    }
  }
  for (let k = 0; k < edges.length; k += 5) {
    const p = edges[k] ?? 0;
    blendPixel(data, p * 4, edges[k + 1] ?? 0, edges[k + 2] ?? 0, edges[k + 3] ?? 0, edges[k + 4] ?? 0);
  }
  return area;
}

function touchesRegion(region: Uint8Array, x: number, y: number, width: number, height: number): boolean {
  const p = y * width + x;
  return (
    (x > 0 && region[p - 1] === 1) ||
    (x < width - 1 && region[p + 1] === 1) ||
    (y > 0 && region[p - width] === 1) ||
    (y < height - 1 && region[p + width] === 1)
  );
}
