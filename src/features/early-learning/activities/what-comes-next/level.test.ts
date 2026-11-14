import { describe, expect, it } from 'vitest';
import activity from './activity.ts';
import { generateLevel, MAX_DIFFICULTY, SHAPES, type PatternItem, type WhatComesNextLevel } from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 3_571 + 7);

/** Whether the row repeats every `period` items. */
function hasPeriod(row: readonly PatternItem[], period: number): boolean {
  return row.every((item, index) => index < period || item === row[index - period]);
}

/**
 * What makes a row fair: its shortest repeating unit is the level's unit, every unit a child could
 * see repeat twice in full gives the same next item, and the choices offer that item once.
 */
function problems(level: WhatComesNextLevel): string[] {
  const found: string[] = [];
  const { shown, answer, unit } = level;
  const shortest = Array.from({ length: shown.length }, (_, index) => index + 1).find((p) => hasPeriod(shown, p));
  if (shortest !== unit.length) found.push(`the row repeats every ${String(shortest)}, not ${String(unit.length)}`);
  if (shown.length < unit.length * 2) found.push('the unit is not shown twice');
  for (let period = 1; period * 2 <= shown.length; period += 1) {
    if (hasPeriod(shown, period) && shown[shown.length - period] !== answer) {
      found.push(`a unit of ${String(period)} gives another next item`);
    }
  }
  // The row starts at the start of the unit, so the first item is the unit's first kind.
  if (new Set(shown.slice(0, unit.length)).size !== new Set(unit).size) found.push('the first unit is not whole');
  if (level.choices.filter((choice) => choice === answer).length !== 1) found.push('the answer is not offered once');
  if (new Set(level.choices).size !== level.choices.length) found.push('a choice repeats');
  for (const item of shown) if (!level.choices.includes(item)) found.push(`${item} is in the row but not a choice`);
  const shapes = level.kind === 'shapes';
  for (const item of [...shown, ...level.choices]) {
    if ((SHAPES as readonly string[]).includes(item) !== shapes) found.push(`${item} is not one of the ${level.kind}`);
  }
  return found;
}

describe('generateLevel', () => {
  // The design: unit lengths, row lengths, and choices per difficulty.
  it.each([
    [1, [2], 4, 5, 3],
    [2, [2], 4, 7, 3],
    [3, [3], 6, 8, 3],
    [4, [3], 6, 8, 3],
    [5, [4], 8, 10, 3],
    [6, [4], 8, 10, 4],
    [7, [5], 10, 12, 4],
    [8, [6], 12, 13, 4],
  ])(
    'at difficulty %i repeats a unit of %j in rows of %i to %i, with %i choices or more',
    (difficulty, lengths, min, max, choices) => {
      const rows = new Set<number>();
      for (const seed of SEEDS) {
        const level = generateLevel(seed, difficulty, 'band-6-8');
        expect(problems(level), `seed ${String(seed)}`).toEqual([]);
        expect(lengths).toContain(level.unit.length);
        expect(level.choices.length).toBe(Math.max(choices, new Set(level.unit).size));
        rows.add(level.shown.length);
      }
      expect(Math.min(...rows)).toBe(min);
      expect(Math.max(...rows)).toBe(max);
    },
  );

  it("stays fair at both ends of every band's range", () => {
    if (activity.kind !== 'rounds') throw new Error('what-comes-next is a rounds activity');
    for (const band of activity.bands) {
      const range = activity.difficulty[band];
      if (range === undefined) throw new Error(`No range for ${band}`);
      for (const difficulty of [range.min, range.max]) {
        for (const seed of SEEDS) expect(problems(generateLevel(seed, difficulty, band))).toEqual([]);
      }
    }
  });

  it('uses pictures in some rounds and shapes in others', () => {
    const kinds = new Set(SEEDS.map((seed) => generateLevel(seed, 1, 'band-3-5').kind));
    expect([...kinds].toSorted((a, b) => a.localeCompare(b))).toEqual(['pictures', 'shapes']);
  });

  it('asks for every place in the unit over many rounds, not always the first', () => {
    const answers = new Set(
      SEEDS.map((seed) => {
        const level = generateLevel(seed, 3, 'band-3-5');
        return level.unit[level.shown.length % level.unit.length];
      }),
    );
    expect([...answers].toSorted((a, b) => (a ?? '').localeCompare(b ?? ''))).toEqual(['a', 'b']);
  });

  it('puts the answer in every place among the choices', () => {
    const places = new Set(
      SEEDS.map((seed) => {
        const level = generateLevel(seed, 6, 'band-6-8');
        return level.choices.indexOf(level.answer);
      }),
    );
    expect([...places].toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it.each([0, MAX_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 8, not/);
  });
});

describe('the fairness check', () => {
  it('catches a row that is too short to show its unit twice', () => {
    const level: WhatComesNextLevel = {
      kind: 'pictures',
      unit: 'abc',
      shown: ['apple', 'banana', 'pear', 'apple'],
      answer: 'banana',
      choices: ['apple', 'banana', 'pear'],
    };
    expect(problems(level)).toContain('the unit is not shown twice');
  });
});
