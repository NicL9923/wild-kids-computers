import { describe, expect, it } from 'vitest';
import { createDocument } from '../core/paint/document.ts';
import { History } from '../core/paint/history.ts';
import { EMPTY_RECT, unionRect, type Rect } from '../core/paint/rect.ts';
import { startStroke } from '../core/paint/session.ts';
import { drawStroke, testSettings, wave } from '../core/paint/testing/golden.ts';
import type { PaintEffect, ToolPoint } from '../core/paint/types.ts';
import { paintEffects } from './paint.ts';

/**
 * Properties every paint-on effect shares, driven by the registry so a new effect is covered
 * the moment it exists. Each effect's own test holds its golden.
 */

type StrokeEffect = Exclude<PaintEffect, { group: 'whole-picture' }>;
const paintOn = paintEffects.filter((effect): effect is StrokeEffect => effect.group === 'paint-on');

/** Effects that paint a pattern fixed to the paper instead of scattering, so the seed does not change them. */
const PATTERNS = new Set(['honeycomb']);

function paintWave(effect: StrokeEffect, seed: number): Uint8ClampedArray {
  const doc = createDocument(200, 125);
  drawStroke(new History(doc), effect, testSettings({ size: 40, seed }), wave());
  return doc.paint.data;
}

/** A stroke that runs down the left edge, then off the bottom right corner and back. */
const ALONG_THE_EDGES: ToolPoint[] = [
  { x: 0, y: -10 },
  { x: 0, y: 60 },
  { x: 2, y: 135 },
  { x: 120, y: 124 },
  { x: 215, y: 140 },
  { x: 199, y: 100 },
];

function changedPixels(before: Uint8ClampedArray, after: Uint8ClampedArray, width: number): { x: number; y: number }[] {
  const changed: { x: number; y: number }[] = [];
  for (let i = 0; i < before.length; i += 4) {
    if (
      before[i] !== after[i] ||
      before[i + 1] !== after[i + 1] ||
      before[i + 2] !== after[i + 2] ||
      before[i + 3] !== after[i + 3]
    ) {
      changed.push({ x: (i / 4) % width, y: Math.floor(i / 4 / width) });
    }
  }
  return changed;
}

const inside = (rect: Rect, p: { x: number; y: number }): boolean =>
  p.x >= rect.x && p.y >= rect.y && p.x < rect.x + rect.width && p.y < rect.y + rect.height;

describe('paint-on effects', () => {
  it('include the reference effect and every scattering effect', () => {
    expect(paintOn.map((effect) => effect.id)).toContain('confetti');
    expect(paintOn.length).toBeGreaterThanOrEqual(10);
  });

  describe.each(paintOn.map((effect) => [effect.id, effect] as const))('%s', (id, effect) => {
    it('paints the same pixels for the same seed', () => {
      const first = paintWave(effect, 7);
      expect(first.some((value) => value !== 255)).toBe(true);
      expect(paintWave(effect, 7)).toEqual(first);
    });

    it.runIf(!PATTERNS.has(id))('scatters differently for another seed', () => {
      expect(paintWave(effect, 8)).not.toEqual(paintWave(effect, 7));
    });

    it('works at the edges and reports every pixel it changed', () => {
      const doc = createDocument(200, 125);
      const before = doc.paint.data.slice();
      const stroke = startStroke(new History(doc), effect, testSettings({ size: 40, seed: 3 }));
      const [first, ...rest] = ALONG_THE_EDGES;
      if (first === undefined) throw new Error('The edge stroke has points.');
      let reported: Rect = stroke.begin(first);
      for (const point of rest) reported = unionRect(reported, stroke.move(point));
      reported = unionRect(reported, stroke.end());
      const changed = changedPixels(before, doc.paint.data, doc.width);
      // The studio repaints only the reported rectangles, so a pixel outside them would never show.
      expect(changed.filter((p) => !inside(reported, p))).toEqual([]);
      expect(changed.some((p) => p.x <= 2)).toBe(true);
      expect(changed.some((p) => p.y >= doc.height - 3)).toBe(true);
    });

    it('puts every pixel back when the stroke is cancelled', () => {
      const doc = createDocument(200, 125);
      const before = doc.paint.data.slice();
      const stroke = startStroke(new History(doc), effect, testSettings({ size: 40, seed: 5 }));
      const [first, ...rest] = wave();
      if (first === undefined) throw new Error('The wave has points.');
      stroke.begin(first);
      for (const point of rest) stroke.move(point);
      expect(doc.paint.data).not.toEqual(before);
      stroke.cancel();
      expect(doc.paint.data).toEqual(before);
    });

    it('paints on a transparent picture without touching what it does not cover', () => {
      const doc = createDocument(200, 125);
      doc.paint.data.fill(0);
      const stroke = startStroke(new History(doc), effect, testSettings({ size: 40, seed: 2 }));
      const changed = unionRect(stroke.begin({ x: 100, y: 60 }), stroke.end());
      expect(changed).not.toEqual(EMPTY_RECT);
      const painted = changedPixels(new Uint8ClampedArray(doc.paint.data.length), doc.paint.data, doc.width);
      expect(painted.length).toBeGreaterThan(0);
      expect(painted.filter((p) => !inside(changed, p))).toEqual([]);
    });
  });
});
