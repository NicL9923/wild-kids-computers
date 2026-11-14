import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COLOR_PAIRINGS } from './colorPairings.ts';
import { contrastRatio, MINIMUM_CONTRAST, relativeLuminance } from './contrast.ts';

// Read from disk. Vitest turns a CSS ?raw import into an empty string unless CSS processing is on.
const tokensCss = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8').replaceAll(/\/\*[\s\S]*?\*\//g, '');

/** Every hex color token in tokens.css. A color redeclared with another value fails the test below. */
function colorTokens(): Map<string, string[]> {
  const tokens = new Map<string, string[]>();
  for (const [, name = '', value = ''] of tokensCss.matchAll(/(--wk-(?:color|profile)-[\w-]+):\s*([^;]+);/g)) {
    tokens.set(name, [...(tokens.get(name) ?? []), value.trim()]);
  }
  return tokens;
}

const tokens = colorTokens();

function valueOf(name: string): string {
  const values = tokens.get(name);
  if (values === undefined) throw new Error(`${name} is not declared in tokens.css`);
  return values[0] ?? '';
}

describe('color tokens', () => {
  it('declares each color once, as hex, so contrast can be checked and no band changes a color unseen', () => {
    const notHexOrRepeated = [...tokens]
      .filter(([name]) => name !== '--wk-color-scrim')
      .filter(([, values]) => values.length !== 1 || !/^#[0-9a-f]{6}$/i.test(values[0] ?? ''))
      .map(([name, values]) => `${name}: ${values.join(' | ')}`);
    expect(notHexOrRepeated).toEqual([]);
  });

  it.each(COLOR_PAIRINGS)(
    '$foreground on $background meets WCAG 2.2 AA for $use ($where)',
    ({ foreground, background, use }) => {
      const ratio = contrastRatio(valueOf(foreground), valueOf(background));
      expect(ratio).toBeGreaterThanOrEqual(MINIMUM_CONTRAST[use]);
    },
  );

  it('pairs every text, on-color, border, focus, and profile mark token with a background', () => {
    const foregrounds = new Set(COLOR_PAIRINGS.map((p) => p.foreground));
    const mustBePaired = [...tokens.keys()].filter((name) =>
      /^--wk-color-(text|on-|border$|focus$)|^--wk-profile-[\w]+-mark$/.test(name),
    );
    expect(mustBePaired.filter((name) => !foregrounds.has(name))).toEqual([]);
    expect(mustBePaired.length).toBeGreaterThan(10);
  });

  it('pairs every profile color with a mark', () => {
    const backgrounds = new Set(COLOR_PAIRINGS.map((p) => p.background));
    const profileColors = [...tokens.keys()].filter(
      (name) => /^--wk-profile-[\w]+$/.test(name) && !name.endsWith('-mark'),
    );
    expect(profileColors.filter((name) => !backgrounds.has(name))).toEqual([]);
    expect(profileColors).toHaveLength(8);
  });
});

describe('contrastRatio', () => {
  it.each([
    { a: '#000000', b: '#ffffff', ratio: 21 },
    { a: '#ffffff', b: '#000000', ratio: 21 },
    { a: '#777777', b: '#ffffff', ratio: 4.48 },
    { a: '#2c5fae', b: '#2c5fae', ratio: 1 },
  ])('gives $ratio for $a on $b', ({ a, b, ratio }) => {
    expect(contrastRatio(a, b)).toBeCloseTo(ratio, 2);
  });

  it('uses the linear segment of the sRGB curve for very dark channels', () => {
    // 0x0a / 255 = 0.0392, under the 0.04045 knee, so it divides by 12.92.
    expect(relativeLuminance('#0a0a0a')).toBeCloseTo(0.0392 / 12.92, 5);
  });

  it.each(['#fff', 'red', 'rgb(0 0 0)', '#12345g', ''])('rejects %j, which is not a six-digit hex color', (value) => {
    expect(() => relativeLuminance(value)).toThrow(/Not a six-digit hex color/);
  });
});
