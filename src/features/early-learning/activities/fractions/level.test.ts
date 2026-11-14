import { describe, expect, it } from 'vitest';
import { createRandom } from '../../../../core/activityKit/random.ts';
import type { Band } from '../../../../core/bands.ts';
import {
  fractionKey,
  fractionsFor,
  generateLevel,
  MAX_FRACTION_DIFFICULTY,
  sameValue,
  tierFor,
  unequalPicture,
  wrongFractions,
  type Fraction,
  type FractionLevel,
  type Picture,
} from './level.ts';
import { fractionName } from './names.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 104_729 + 3);

const shadedShare = (picture: Picture) => picture.shaded.reduce((sum, index) => sum + (picture.parts[index] ?? 0), 0);

/** What makes a round fair: pictures that show their fraction, and one right answer by value. */
function problems(level: FractionLevel, difficulty: number): string[] {
  const tier = tierFor(difficulty);
  const found: string[] = [];
  if (level.mode !== tier.mode) found.push(`mode ${level.mode}`);
  for (const picture of level.pictures) {
    const total = picture.parts.reduce((sum, part) => sum + part, 0);
    if (Math.abs(total - 1) > 1e-9) found.push(`${picture.id} parts do not make a whole`);
    if (new Set(picture.shaded).size !== picture.shaded.length) found.push(`${picture.id} shades a part twice`);
    if (picture.shaded.some((index) => index < 0 || index >= picture.parts.length))
      found.push(`${picture.id} shades a missing part`);
    if (picture.fraction === null) {
      // A shape with parts that are not equal never shows the target's share.
      if (picture.parts.every((part) => Math.abs(part - (picture.parts[0] ?? 0)) < 1e-9))
        found.push(`${picture.id} is equal`);
      if (Math.abs(shadedShare(picture) - level.target.numerator / level.target.denominator) < 0.06) {
        found.push(`${picture.id} looks like the answer`);
      }
      continue;
    }
    if (picture.parts.length !== picture.fraction.denominator)
      found.push(`${picture.id} has the wrong number of parts`);
    if (picture.shaded.length !== picture.fraction.numerator) found.push(`${picture.id} shades the wrong number`);
    if (picture.shape === 'grid' && ![4, 6, 8].includes(picture.parts.length))
      found.push(`${picture.id} grid of ${String(picture.parts.length)}`);
  }
  if (level.mode === 'pick-picture') {
    if (level.pictures.length !== tier.choices) found.push(`${String(level.pictures.length)} pictures`);
    if (new Set(level.pictures.map((picture) => picture.shape)).size !== 1) found.push('the pictures mix shapes');
    const right = level.pictures.filter(
      (picture) => picture.fraction !== null && sameValue(picture.fraction, level.target),
    );
    if (right.length !== 1 || right[0]?.id !== level.answer) found.push('the answer is not the one matching picture');
    const unequal = tier.unequal && level.target.denominator <= 4;
    if (level.pictures.some((picture) => picture.fraction === null) !== unequal) found.push('unequal picture');
  } else {
    const [picture] = level.pictures;
    if (level.pictures.length !== 1 || picture?.fraction !== level.target) found.push('the picture is not the target');
    if (level.fractions.length !== tier.choices) found.push(`${String(level.fractions.length)} fractions`);
    const right = level.fractions.filter((fraction) => sameValue(fraction, level.target));
    if (right.length !== 1 || fractionKey(right[0] ?? level.target) !== level.answer)
      found.push('the answer is not offered once');
  }
  return found;
}

const together = (picture: Picture) => picture.shaded.every((index, at) => index === at);

const keysOf = (fractions: readonly Fraction[]) => fractions.map(fractionKey);

describe('generateLevel', () => {
  it.each(Array.from({ length: MAX_FRACTION_DIFFICULTY }, (_, index) => index + 1))(
    'at difficulty %i gives a fair round for every seed',
    (difficulty) => {
      for (const seed of SEEDS) {
        expect(problems(generateLevel(seed, difficulty, 'band-9-12'), difficulty), `seed ${String(seed)}`).toEqual([]);
      }
    },
  );

  // The edges of each band's range in activity.ts.
  it.each<[Band, number, string, readonly string[]]>([
    ['band-6-8', 1, 'pick-picture', ['1/2', '1/3', '1/4']],
    ['band-6-8', 5, 'pick-fraction', ['1/2', '1/3', '1/4', '2/3', '2/4', '3/4']],
    ['band-9-12', 3, 'pick-picture', ['1/3', '1/4', '2/3', '2/4', '3/4']],
    ['band-9-12', 8, 'pick-fraction', keysOf(fractionsFor(tierFor(8)))],
  ])('in %s at difficulty %i asks %s with targets %j', (band, difficulty, mode, targets) => {
    const levels = SEEDS.map((seed) => generateLevel(seed, difficulty, band));
    expect([...new Set(levels.map((level) => fractionKey(level.target)))].toSorted()).toEqual([...targets].toSorted());
    for (const level of levels) {
      expect(level.mode).toBe(mode);
      expect(problems(level, difficulty)).toEqual([]);
    }
  });

  it('shades parts side by side at first, and apart at the top', () => {
    const equal = SEEDS.slice(0, 50).flatMap((seed) =>
      generateLevel(seed, 4, 'band-9-12').pictures.filter((picture) => picture.fraction !== null),
    );
    expect(equal.every(together)).toBe(true);
    const apart = SEEDS.flatMap((seed) => generateLevel(seed, 8, 'band-9-12').pictures).filter(
      (picture) => !together(picture),
    );
    expect(apart.length).toBeGreaterThan(SEEDS.length / 4);
  });

  it('uses circles, bars, and grids', () => {
    const shapes = new Set(
      SEEDS.flatMap((seed) => generateLevel(seed, 2, 'band-6-8').pictures.map((picture) => picture.shape)),
    );
    expect([...shapes].toSorted()).toEqual(['bar', 'circle', 'grid']);
  });

  it('puts the right picture in every place over many rounds', () => {
    const places = new Set(SEEDS.map((seed) => generateLevel(seed, 7, 'band-9-12').answer));
    expect([...places].toSorted()).toEqual(['picture-0', 'picture-1', 'picture-2', 'picture-3']);
  });

  it('names every fraction a round can use', () => {
    for (let difficulty = 1; difficulty <= MAX_FRACTION_DIFFICULTY; difficulty += 1) {
      for (const fraction of fractionsFor(tierFor(difficulty))) expect(fractionName(fraction).kind).toBe('spoken');
    }
    expect(() => fractionName({ numerator: 1, denominator: 7 })).toThrow('No name for the fraction 1/7.');
  });

  it.each([0, MAX_FRACTION_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-6-8')).toThrow(/difficulty 1 to 8, not/);
  });
});

describe('wrongFractions', () => {
  it('never offers a fraction equal in value to the target or to another choice', () => {
    const all = fractionsFor(tierFor(8));
    for (let seed = 0; seed < 200; seed += 1) {
      const target = { numerator: 2, denominator: 4 };
      const wrong = wrongFractions(createRandom(seed), target, all, 3);
      expect(wrong.some((fraction) => sameValue(fraction, target))).toBe(false);
      for (const [index, fraction] of wrong.entries()) {
        expect(wrong.slice(index + 1).some((other) => sameValue(other, fraction))).toBe(false);
      }
    }
  });

  it('prefers the likely confusions: the same parts, the same number shaded, or the unshaded share', () => {
    const all = fractionsFor(tierFor(8));
    const target = { numerator: 3, denominator: 8 };
    for (let seed = 0; seed < 100; seed += 1) {
      for (const fraction of wrongFractions(createRandom(seed), target, all, 3)) {
        expect(fraction.denominator === 8 || fraction.numerator === 3 || fraction.numerator === 5).toBe(true);
      }
    }
  });

  it('refuses when there are not enough different values, naming the target', () => {
    const halves = [
      { numerator: 1, denominator: 2 },
      { numerator: 2, denominator: 4 },
    ];
    expect(() => wrongFractions(createRandom(1), { numerator: 1, denominator: 2 }, halves, 1)).toThrow(
      'Fractions needs 1 wrong choices for 1/2, found 0.',
    );
  });
});

describe('unequalPicture', () => {
  it('makes the first part larger, and halves become three quarters and one quarter', () => {
    expect(unequalPicture('p', 'bar', { numerator: 1, denominator: 2 }).parts).toEqual([0.75, 0.25]);
    const thirds = unequalPicture('p', 'circle', { numerator: 2, denominator: 3 });
    expect(thirds.parts[0]).toBeCloseTo(0.6);
    expect(thirds.parts[1]).toBeCloseTo(0.2);
    expect(thirds.shaded).toEqual([0, 1]);
    expect(thirds.fraction).toBeNull();
  });
});
