import { describe, expect, it } from 'vitest';
import { BANDS } from '../../../../core/bands.ts';
import { FREE_MODES } from '../../engine/freeMode.ts';
import activity from './activity.ts';
import { generateLevel } from './level.ts';

describe('robot-free-draw', () => {
  it('serves every band', () => {
    expect(activity.bands).toEqual(BANDS);
  });

  it.each(BANDS)('gives %s the blocks the engine sets for it, whatever the seed', (band) => {
    expect(generateLevel(1, band)).toBe(FREE_MODES[band]);
    expect(generateLevel(4_294_967_295, band)).toBe(FREE_MODES[band]);
  });

  it('lets the youngest children press arrows and colors that run at once, and older ones build', () => {
    expect(BANDS.map((band) => generateLevel(0, band).style)).toEqual(['direct', 'build', 'build']);
  });
});
