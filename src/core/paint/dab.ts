import { blendPixel, div255 } from './color.ts';
import type { PaintDocument } from './document.ts';
import { tileOffset, type Change } from './history.ts';
import { EMPTY_RECT, unionRect, type Rect } from './rect.ts';
import type { Dab, StrokeContext, ToolPoint, ToolStroke } from './types.ts';

/**
 * The dab pipeline.
 *
 * A trail walks the stroke and places a dab every few pixels. A tip paints each dab through a
 * DabCanvas, pixel by pixel, with a coverage from 0 to 255. Within one stroke a pixel keeps the
 * highest coverage any dab gave it, and the canvas blends from the pixel as it was before the
 * stroke. Overlapping dabs therefore never darken each other: a half-transparent marker stays
 * even, and a soft brush has no beads along its length.
 */

// One coverage mask per document, reused by every stroke and cleared where a stroke wrote.
const masks = new WeakMap<PaintDocument, Uint8Array>();

function strokeMask(doc: PaintDocument): Uint8Array {
  let mask = masks.get(doc);
  if (mask === undefined) {
    mask = new Uint8Array(doc.width * doc.height);
    masks.set(doc, mask);
  }
  return mask;
}

export class DabCanvas {
  readonly width: number;
  readonly height: number;
  private readonly data: Uint8ClampedArray;
  private readonly mask: Uint8Array;
  private readonly change: Change;
  private minX = Number.POSITIVE_INFINITY;
  private minY = Number.POSITIVE_INFINITY;
  private maxX = Number.NEGATIVE_INFINITY;
  private maxY = Number.NEGATIVE_INFINITY;
  private strokeArea: Rect = EMPTY_RECT;

  constructor(doc: PaintDocument, change: Change) {
    this.width = doc.width;
    this.height = doc.height;
    this.data = doc.paint.data;
    this.mask = strokeMask(doc);
    this.change = change;
  }

  /**
   * Paints color (r, g, b, a) at pixel (x, y) with a coverage from 0 to 255. A coverage lower
   * than this stroke already gave the pixel changes nothing. An equal or higher one repaints
   * the pixel from its color before the stroke, so a later dab can recolor a pixel.
   */
  put(x: number, y: number, coverage: number, r: number, g: number, b: number, a = 255): void {
    if (coverage <= 0 || x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const p = y * this.width + x;
    if (coverage < (this.mask[p] ?? 0)) return;
    this.mask[p] = coverage;
    const before = this.change.tileAt(x, y);
    const t = tileOffset(x, y);
    const i = p * 4;
    const data = this.data;
    data[i] = before[t] ?? 0;
    data[i + 1] = before[t + 1] ?? 0;
    data[i + 2] = before[t + 2] ?? 0;
    data[i + 3] = before[t + 3] ?? 0;
    blendPixel(data, i, r, g, b, div255(a * coverage));
    if (x < this.minX) this.minX = x;
    if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y;
    if (y > this.maxY) this.maxY = y;
  }

  /** Reads the pixel at (x, y) as it was before this stroke into out[0..3]. */
  readBefore(x: number, y: number, out: number[]): void {
    const before = this.change.tileAt(x, y);
    const t = tileOffset(x, y);
    out[0] = before[t] ?? 0;
    out[1] = before[t + 1] ?? 0;
    out[2] = before[t + 2] ?? 0;
    out[3] = before[t + 3] ?? 0;
  }

  /** The rectangle written since the last call. */
  takeChanged(): Rect {
    if (this.minX > this.maxX) return EMPTY_RECT;
    const rect = { x: this.minX, y: this.minY, width: this.maxX - this.minX + 1, height: this.maxY - this.minY + 1 };
    this.strokeArea = unionRect(this.strokeArea, rect);
    this.minX = Number.POSITIVE_INFINITY;
    this.minY = Number.POSITIVE_INFINITY;
    this.maxX = Number.NEGATIVE_INFINITY;
    this.maxY = Number.NEGATIVE_INFINITY;
    return rect;
  }

  /** Clears this stroke's coverage so the next stroke starts fresh. */
  finish(): void {
    this.takeChanged();
    const area = this.strokeArea;
    for (let y = area.y; y < area.y + area.height; y++) {
      const start = y * this.width + area.x;
      this.mask.fill(0, start, start + area.width);
    }
    this.strokeArea = EMPTY_RECT;
  }
}

/**
 * Visits every pixel within radius + 1 of (cx, cy) with its distance from the center.
 * Tips build their coverage from that distance.
 */
export function forEachInDisc(
  cx: number,
  cy: number,
  radius: number,
  visit: (x: number, y: number, distance: number, dx: number, dy: number) => void,
): void {
  const reach = radius + 1;
  const y0 = Math.floor(cy - reach);
  const y1 = Math.ceil(cy + reach);
  const x0 = Math.floor(cx - reach);
  const x1 = Math.ceil(cx + reach);
  const reachSquared = reach * reach;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const squared = dx * dx + dy * dy;
      if (squared > reachSquared) continue;
      visit(x, y, Math.sqrt(squared), dx, dy);
    }
  }
}

/** Antialiased coverage, 0 to 255, of a hard-edged disc at a pixel this far from its center. */
export function discCoverage(radius: number, distance: number): number {
  const amount = radius - distance + 0.5;
  if (amount <= 0) return 0;
  if (amount >= 1) return 255;
  return Math.round(amount * 255);
}

interface TrailPoint {
  x: number;
  y: number;
  pressure: number;
}

/**
 * Places dabs at an even spacing along a polyline. Where dabs land depends only on the points,
 * not on how the studio batches them into move calls, so the same stroke paints the same pixels.
 */
export class DabTrail {
  private readonly spacing: number;
  private last: TrailPoint | null = null;
  private untilNext = 0;
  private distance = 0;
  private index = 0;
  private dirX = 1;
  private dirY = 0;

  constructor(spacing: number) {
    this.spacing = Math.max(1, spacing);
  }

  begin(at: ToolPoint, emit: (place: Omit<Dab, 'size' | 'color' | 'seed'>) => void): void {
    this.last = { x: at.x, y: at.y, pressure: at.pressure ?? 1 };
    this.untilNext = this.spacing;
    this.distance = 0;
    this.index = 0;
    emit(this.place(this.last));
  }

  move(to: ToolPoint, emit: (place: Omit<Dab, 'size' | 'color' | 'seed'>) => void): void {
    const from = this.last;
    if (from === null) return;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) return;
    const pressure = to.pressure ?? 1;
    this.dirX = dx / length;
    this.dirY = dy / length;
    let travelled = 0;
    while (travelled + this.untilNext <= length) {
      travelled += this.untilNext;
      this.distance += this.untilNext;
      this.untilNext = this.spacing;
      const t = travelled / length;
      emit(
        this.place({
          x: from.x + dx * t,
          y: from.y + dy * t,
          pressure: from.pressure + (pressure - from.pressure) * t,
        }),
      );
    }
    this.untilNext -= length - travelled;
    this.distance += length - travelled;
    this.last = { x: to.x, y: to.y, pressure };
  }

  private place(point: TrailPoint): Omit<Dab, 'size' | 'color' | 'seed'> {
    const place = {
      x: point.x,
      y: point.y,
      index: this.index,
      distance: this.distance,
      dirX: this.dirX,
      dirY: this.dirY,
      pressure: point.pressure,
    };
    this.index += 1;
    return place;
  }
}

/**
 * A stroke that places dabs along a trail. Brushes, the eraser, and brush-like effects build on
 * it: they supply the spacing and a function that paints one dab and returns what it changed.
 */
export function trailStroke(
  ctx: StrokeContext,
  spacing: number,
  paintDab: (dab: Dab) => Rect,
  finish: () => void = () => undefined,
): ToolStroke {
  const { settings } = ctx;
  const trail = new DabTrail(spacing);
  let changed = EMPTY_RECT;
  const emit = (place: Omit<Dab, 'size' | 'color' | 'seed'>): void => {
    changed = unionRect(
      changed,
      paintDab({ ...place, size: settings.size, color: settings.color, seed: settings.seed }),
    );
  };
  const take = (): Rect => {
    const result = changed;
    changed = EMPTY_RECT;
    return result;
  };
  return {
    begin(at) {
      trail.begin(at, emit);
      return take();
    },
    move(to) {
      trail.move(to, emit);
      return take();
    },
    end() {
      finish();
      return EMPTY_RECT;
    },
    cancel() {
      finish();
      return ctx.change.revert();
    },
  };
}

/** A stroke for a brush tip: max-coverage dabs through a DabCanvas. */
export function tipStroke(ctx: StrokeContext, tip: StrokeContext['settings']['tip']): ToolStroke {
  const canvas = new DabCanvas(ctx.doc, ctx.change);
  return trailStroke(
    ctx,
    tip.spacing * ctx.settings.size,
    (dab) => {
      tip.paint(canvas, dab);
      return canvas.takeChanged();
    },
    () => canvas.finish(),
  );
}
