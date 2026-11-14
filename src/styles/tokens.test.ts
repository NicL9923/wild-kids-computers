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

/** The custom properties a band rule sets, by property name, from the rule naming `selector`. */
function bandProperties(selector: string): string[] {
  const rules = tokensCss.replaceAll(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g);
  for (const [, selectorList = '', body = ''] of rules) {
    if (
      !selectorList
        .split(',')
        .map((part) => part.trim())
        .includes(selector)
    )
      continue;
    return [...body.matchAll(/(--wk-[\w-]+)\s*:/g)].map((match) => match[1] ?? '').toSorted();
  }
  return [];
}

describe('band rules', () => {
  // A band nested inside another band's page, such as the parent corner's text preview, gets
  // only the values its own rule sets. A value one band forgets would leak in from the page.
  it('each set the same properties', () => {
    const [first, ...rest] = BANDS.map((band) => bandProperties(`[data-band='${band}']`));
    expect(first?.length).toBeGreaterThan(1);
    for (const properties of rest) expect(properties).toEqual(first);
  });
});
