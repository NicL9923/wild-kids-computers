import { describe, expect, it } from 'vitest';
import { unionRect, type Rect } from '../core/paint/rect.ts';
import { startStroke } from '../core/paint/session.ts';
import { drawStroke, newPicture, testSettings, wave } from '../core/paint/testing/golden.ts';
import { paintSpectrum } from '../core/paint/testing/pictures.ts';
import type { PaintEffect, PictureEffect, ToolPoint } from '../core/paint/types.ts';
import { paintEffects } from './paint.ts';

/**
 * Rules every distort and color effect keeps, whatever it does to the picture. The goldens show
 * what each effect does. These catch what a golden cannot: the edges of the canvas, a size of
 * zero, a transparent picture, and the rectangle the studio repaints.
 */

type StrokeEffect = Exclude<PaintEffect, PictureEffect>;

const isMoveOrColor = (effect: PaintEffect): effect is StrokeEffect =>
  effect.group === 'distort' || effect.group === 'color';
const strokeEffects = paintEffects.filter(isMoveOrColor);
const distortEffects = strokeEffects.filter((effect) => effect.group === 'distort');

/** A stroke that starts off the top-left corner, crosses the picture, and leaves past the bottom-right one. */
const ACROSS_CORNERS: readonly ToolPoint[] = Array.from({ length: 25 }, (_, i) => ({
  x: -30 + i * 10,
  y: -20 + i * 6.5,
}));

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

describe('distort and color effects', () => {
  it('include the two references and the effects built on them', () => {
    expect(strokeEffects.map((effect) => effect.id)).toEqual(expect.arrayContaining(['swirl', 'hueShift']));
    expect(strokeEffects.length).toBeGreaterThan(2);
  });

  describe.each(strokeEffects)('$id', (effect) => {
    it('changes nothing and leaves no undo step at size zero', () => {
      const { doc, history } = newPicture();
      paintSpectrum(doc);
      const before = doc.paint.data.slice();
      drawStroke(history, effect, testSettings({ size: 0 }), wave());
      expect(changedPixels(before, doc.paint.data, doc.width)).toEqual([]);
      expect(history.canUndo).toBe(false);
    });

    it('changes nothing on a fully transparent picture', () => {
      const { doc, history } = newPicture();
      doc.paint.data.fill(0);
      drawStroke(history, effect, testSettings({ size: 40 }), wave());
      expect(changedPixels(new Uint8ClampedArray(doc.paint.data.length), doc.paint.data, doc.width)).toEqual([]);
    });

    it('reports every pixel it changes, on a stroke that runs off the corners', () => {
      const { doc, history } = newPicture();
      paintSpectrum(doc);
      const before = doc.paint.data.slice();
      const stroke = startStroke(history, effect, testSettings({ size: 40 }));
      const [first, ...rest] = ACROSS_CORNERS;
      let reported = stroke.begin(first ?? { x: 0, y: 0 });
      for (const point of rest) reported = unionRect(reported, stroke.move(point));
      reported = unionRect(reported, stroke.end());
      const changed = changedPixels(before, doc.paint.data, doc.width);
      expect(changed.length).toBeGreaterThan(0);
      expect(changed.filter((p) => !inside(reported, p))).toEqual([]);
    });

    it('puts every pixel back on cancel', () => {
      const { doc, history } = newPicture();
      paintSpectrum(doc);
      const before = doc.paint.data.slice();
      const stroke = startStroke(history, effect, testSettings({ size: 40 }));
      stroke.begin({ x: 20, y: 60 });
      stroke.move({ x: 180, y: 60 });
      stroke.cancel();
      expect(changedPixels(before, doc.paint.data, doc.width)).toEqual([]);
      expect(history.canUndo).toBe(false);
    });
  });

  // A flat color has nothing to move, so a distort effect that leaves a trace on it is moving
  // in something that is not there, such as darkness from off the canvas. Pond rings also light
  // and shade its rings, which shows on a flat color by design.
  it.each(distortEffects.filter((effect) => effect.id !== 'pondRings'))(
    '$id leaves one flat color unchanged, even from off the canvas',
    (effect) => {
      const { doc, history } = newPicture();
      for (let i = 0; i < doc.paint.data.length; i += 4) doc.paint.data.set([230, 60, 60, 255], i);
      const before = doc.paint.data.slice();
      drawStroke(history, effect, testSettings({ size: 40 }), ACROSS_CORNERS);
      expect(changedPixels(before, doc.paint.data, doc.width)).toEqual([]);
      expect(history.canUndo).toBe(false);
    },
  );
});
