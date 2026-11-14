import { describe, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, testSettings } from '../../testing/golden.ts';
import { paintChecks } from '../../testing/pictures.ts';
import puff from './index.ts';

describe('puff effect', () => {
  it('puffs the picture up under a click and along a stroke', () => {
    const { doc, history } = newPicture();
    paintChecks(doc);
    drawStroke(history, puff, testSettings({ size: 80 }), [{ x: 55, y: 62 }]);
    drawStroke(history, puff, testSettings({ size: 50 }), [
      { x: 125, y: 35 },
      { x: 175, y: 90 },
    ]);
    expectGolden('effect-puff', doc.paint);
  });
});
