import { describe, expect, it } from 'vitest';
import { rgba } from './color.ts';
import { partnerTone, patternCoverage } from './patterns.ts';
import { PATTERN_IDS } from './types.ts';

describe('patterns', () => {
  it.each(PATTERN_IDS)('%s shows both tones within every 48 px square, with coverage from 0 to 1', (pattern) => {
    for (const [ox, oy] of [
      [0, 0],
      [37, 91],
      [800, 500],
    ] as const) {
      let foreground = 0;
      let background = 0;
      for (let y = oy; y < oy + 48; y++) {
        for (let x = ox; x < ox + 48; x++) {
          const coverage = patternCoverage(pattern, x, y);
          expect(coverage >= 0 && coverage <= 1).toBe(true);
          if (coverage === 1) foreground += 1;
          if (coverage === 0) background += 1;
        }
      }
      // Neither tone takes over: each fills at least a fifth of the square.
      expect(foreground).toBeGreaterThan(48 * 48 * 0.2);
      expect(background).toBeGreaterThan(48 * 48 * 0.2);
    }
  });

  it('pairs a dark color with a lighter tone and a light color with a darker one', () => {
    expect(partnerTone(rgba(20, 40, 160))).toEqual(rgba(161, 169, 217));
    expect(partnerTone(rgba(250, 230, 120))).toEqual(rgba(163, 150, 78));
  });
});
