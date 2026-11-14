import { describe, expect, it } from 'vitest';
import { discCoverage, forEachInDisc } from '../../dab.ts';
import { drawStroke, expectGolden, newPicture, testSettings, wave } from '../../testing/golden.ts';
import { paintSpectrum } from '../../testing/pictures.ts';
import opposites from './index.ts';

describe('opposites effect', () => {
  it('swaps the colors under the brush for their opposites', () => {
    const { doc, history } = newPicture();
    paintSpectrum(doc);
    drawStroke(history, opposites, testSettings({ size: 44 }), wave());
    expectGolden('effect-opposites', doc.paint);
  });

  it('swaps again on a second stroke over the same place, which brings the colors back', () => {
    const { doc, history } = newPicture();
    paintSpectrum(doc);
    const before = doc.paint.data.slice();
    drawStroke(history, opposites, testSettings({ size: 44 }), wave());
    drawStroke(history, opposites, testSettings({ size: 44 }), wave());
    // Along the middle of the stroke, where both strokes cover fully. The soft edge mixes twice.
    for (const point of wave()) {
      const i = (Math.floor(point.y) * doc.width + Math.floor(point.x)) * 4;
      expect([...doc.paint.data.subarray(i, i + 4)], `at ${point.x}, ${point.y}`).toEqual([
        ...before.subarray(i, i + 4),
      ]);
    }
  });

  it('recolors the soft edge of a later click inside an earlier stroke', () => {
    const { doc, history } = newPicture();
    paintSpectrum(doc);
    drawStroke(history, opposites, testSettings({ size: 44 }), wave());
    const between = doc.paint.data.slice();
    const click = { x: 100.5, y: 62.5 };
    drawStroke(history, opposites, testSettings({ size: 10 }), [click]);
    // A ring around the click's edge, where it gives partial coverage over fully covered pixels.
    const unchanged: string[] = [];
    forEachInDisc(click.x, click.y, 5, (x, y, distance) => {
      if (discCoverage(5, distance) < 64) return;
      const i = (y * doc.width + x) * 4;
      if (doc.paint.data[i] === between[i] && doc.paint.data[i + 1] === between[i + 1]) unchanged.push(`${x},${y}`);
    });
    expect(unchanged).toEqual([]);
  });
});
