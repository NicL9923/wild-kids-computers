import { describe, expect, it } from 'vitest';
import { drawStroke, expectGolden, loadFixture, newPicture, testSettings } from '../../testing/golden.ts';
import type { StampSettings } from '../../types.ts';
import stamp from './index.ts';

const flag = loadFixture('stamp-flag');

function place(
  history: Parameters<typeof drawStroke>[0],
  size: number,
  x: number,
  y: number,
  options: Partial<StampSettings> = {},
): void {
  const settings = testSettings({ size, stamp: { bitmap: flag, rotation: 0, flipX: false, flipY: false, ...options } });
  drawStroke(history, stamp, settings, [{ x, y }]);
}

describe('stamp tool', () => {
  it('places a stamp at its own size, shrunk, enlarged, flipped both ways, and turned', () => {
    const { doc, history } = newPicture();
    place(history, 64, 36, 30);
    place(history, 24, 90, 18);
    place(history, 40, 140, 30, { flipX: true });
    place(history, 40, 180, 30, { flipY: true });
    place(history, 96, 50, 90, { rotation: 30 });
    place(history, 48, 120, 90, { rotation: 90 });
    place(history, 48, 170, 95, { rotation: 200, flipX: true });
    expectGolden('tool-stamp', doc.paint);
  });

  it('changes nothing and adds no undo step for a fully transparent stamp', () => {
    const { doc, history } = newPicture();
    const before = doc.paint.data.slice();
    drawStroke(
      history,
      stamp,
      testSettings({
        size: 40,
        stamp: { bitmap: loadFixture('stamp-clear'), rotation: 45, flipX: false, flipY: false },
      }),
      [{ x: 100, y: 60 }],
    );
    expect(doc.paint.data).toEqual(before);
    expect(history.canUndo).toBe(false);
  });

  it('turns a stamp a full circle back to the unturned result', () => {
    const turned = newPicture();
    place(turned.history, 50, 100, 60, { rotation: 360 });
    const plain = newPicture();
    place(plain.history, 50, 100, 60);
    expect(turned.doc.paint.data).toEqual(plain.doc.paint.data);
  });
});
