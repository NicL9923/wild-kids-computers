import { describe, expect, it } from 'vitest';
import { applyPictureEffect } from '../../session.ts';
import { cloneSurface } from '../../surface.ts';
import { drawStroke, expectGolden, newPicture, ORANGE, testSettings, wave } from '../../testing/golden.ts';
import brush from '../../tools/brush/index.ts';
import mirror from './index.ts';

function picture() {
  const result = newPicture();
  drawStroke(result.history, brush, testSettings({ size: 14 }), wave());
  drawStroke(result.history, brush, testSettings({ size: 10, color: ORANGE }), [
    { x: 10, y: 110 },
    { x: 90, y: 20 },
  ]);
  return result;
}

describe('mirror effect', () => {
  it('reflects the left half onto the right half', () => {
    const { doc, history } = picture();
    applyPictureEffect(history, mirror);
    expectGolden('effect-mirror', doc.paint);
  });

  it('is a pure function of the source pixels: the source stays, and running it twice gives the same result', () => {
    const { doc } = picture();
    const source = cloneSurface(doc.paint);
    const first = cloneSurface(doc.paint);
    const second = cloneSurface(doc.paint);
    if (mirror.group !== 'whole-picture') throw new Error('mirror is a whole-picture effect.');
    mirror.apply(source, first);
    mirror.apply(source, second);
    expect(source.data).toEqual(doc.paint.data);
    expect(second.data).toEqual(first.data);
  });

  it('is one undo step', () => {
    const { doc, history } = picture();
    const before = doc.paint.data.slice();
    applyPictureEffect(history, mirror);
    history.undo();
    expect(doc.paint.data).toEqual(before);
  });
});
