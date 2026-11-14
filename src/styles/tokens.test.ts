import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BANDS, DEFAULT_BAND } from '../core/bands.ts';

// Read from disk. Vitest turns a CSS ?raw import into an empty string unless CSS processing is on.
const tokensCss = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

/** Returns the --wk-target-min value in px from the rule whose selector list contains `selector`. */
function targetMinFor(selector: string): number | undefined {
  const rules = tokensCss.replaceAll(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g);
  for (const [, selectorList = '', body = ''] of rules) {
    const selectors = selectorList.split(',').map((part) => part.trim());
    if (!selectors.includes(selector)) continue;
    const match = /--wk-target-min:\s*(\d+)px/.exec(body);
    if (match?.[1] !== undefined) return Number(match[1]);
  }
  return undefined;
}

describe('band target sizes', () => {
  it('gives every band a smallest target size', () => {
    for (const band of BANDS) {
      expect(targetMinFor(`[data-band='${band}']`), band).toBeGreaterThan(0);
    }
  });

  it('never gives an older band a larger target than a younger band', () => {
    const sizes = BANDS.map((band) => targetMinFor(`[data-band='${band}']`) ?? 0);
    const sortedLargestFirst = sizes.toSorted((a, b) => b - a);
    expect(sizes).toEqual(sortedLargestFirst);
  });

  it('uses the default band size before any band is set', () => {
    expect(targetMinFor(':root')).toBe(targetMinFor(`[data-band='${DEFAULT_BAND}']`));
  });
});
