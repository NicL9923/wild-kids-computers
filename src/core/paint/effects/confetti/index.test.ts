import { describe, expect, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, testSettings, wave } from '../../testing/golden.ts';
import confetti from './index.ts';

function throwConfetti(seed: number): Uint8ClampedArray {
  const { doc, history } = newPicture();
  drawStroke(history, confetti, testSettings({ size: 40, seed }), wave());
  return doc.paint.data;
}

describe('confetti effect', () => {
  it('scatters confetti along the stroke', () => {
    expectGolden('effect-confetti', { width: 200, height: 125, data: throwConfetti(7) });
  });

  it('lands the same way for the same seed and differently for another seed', () => {
    expect(throwConfetti(7)).toEqual(throwConfetti(7));
    expect(throwConfetti(8)).not.toEqual(throwConfetti(7));
  });
});
