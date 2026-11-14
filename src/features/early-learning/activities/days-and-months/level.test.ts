import { describe, expect, it } from 'vitest';
import { CYCLE_LENGTH, generateLevel, MAX_DIFFICULTY, nearMisses, step, type DaysAndMonthsLevel } from './level.ts';

const byNumber = (a: number, b: number) => a - b;

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 9_973 + 3);

/** What makes a round fair: one right answer offered once, or a real run that starts out of order. */
function problems(level: DaysAndMonthsLevel): string[] {
  const found: string[] = [];
  const length = CYCLE_LENGTH[level.cycle];
  if (level.mode === 'order') {
    level.run.forEach((item, index) => {
      if (index > 0 && item !== ((level.run[index - 1] ?? 0) + 1) % length) found.push('the run skips');
    });
    if ([...level.tiles].toSorted(byNumber).join() !== [...level.run].toSorted(byNumber).join())
      found.push('the tiles are not the run');
    if (level.tiles.join() === level.run.join()) found.push('the tiles start in order');
  } else {
    const expected = (level.given + (level.mode === 'after' ? 1 : length - 1)) % length;
    if (level.answer !== expected) found.push('the answer is wrong');
    if (level.choices.filter((choice) => choice === level.answer).length !== 1)
      found.push('the answer is not offered once');
    if (new Set(level.choices).size !== level.choices.length) found.push('a choice repeats');
    if (level.choices.some((choice) => choice < 0 || choice >= length)) found.push('a choice is not a day or month');
  }
  return found;
}

/** Whether the round goes round the end of the week or year. */
function wraps(level: DaysAndMonthsLevel): boolean {
  if (level.mode === 'order') return level.run.some((item, index) => index > 0 && item < (level.run[index - 1] ?? 0));
  return Math.abs(level.answer - level.given) > 1;
}

describe('generateLevel', () => {
  // The design table: the kinds of round each difficulty mixes, as cycle, mode, and count.
  it.each([
    [1, ['days after 3'], false],
    [2, ['days after 3', 'days before 3'], false],
    [3, ['days after 3', 'days before 3', 'days order 3'], true],
    [4, ['days order 4', 'months after 3'], true],
    [5, ['days order 5', 'months after 3', 'months before 3'], true],
    [6, ['months before 4', 'months order 3'], true],
    [7, ['months after 4', 'months order 4'], true],
    [8, ['months after 4', 'months before 4', 'months order 5'], true],
  ])('at difficulty %i mixes %j, going round the end: %s', (difficulty, kinds, wrapping) => {
    const seen = new Set<string>();
    let wrapped = false;
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
      const count = level.mode === 'order' ? level.tiles.length : level.choices.length;
      seen.add(`${level.cycle} ${level.mode} ${String(count)}`);
      wrapped ||= wraps(level);
    }
    expect([...seen].toSorted((a, b) => a.localeCompare(b))).toEqual(kinds);
    expect(wrapped).toBe(wrapping);
  });

  it('repeats a round for the same seed and changes it for another', () => {
    expect(generateLevel(3, 5, 'band-6-8')).toEqual(generateLevel(3, 5, 'band-6-8'));
    expect(generateLevel(3, 5, 'band-6-8')).not.toEqual(generateLevel(4, 5, 'band-6-8'));
  });

  it('puts the answer in every place across rounds', () => {
    const places = new Set(
      SEEDS.map((seed) => {
        const level = generateLevel(seed, 1, 'band-6-8');
        return level.mode === 'order' ? -1 : level.choices.indexOf(level.answer);
      }),
    );
    expect([...places].toSorted(byNumber)).toEqual([0, 1, 2]);
  });

  it.each([0, MAX_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-6-8')).toThrow(
      `Days and months has difficulty 1 to 8, not ${String(difficulty)}.`,
    );
  });
});

describe('step', () => {
  it.each([
    ['days', 6, 1, 0],
    ['days', 0, -1, 6],
    ['months', 11, 1, 0],
    ['months', 0, -1, 11],
    ['months', 4, 2, 6],
  ] as const)('in %s goes from %i by %i to %i', (cycle, from, by, to) => {
    expect(step(cycle, from, by)).toBe(to);
  });
});

describe('nearMisses', () => {
  it('offers the day before, the day after next, and the day itself first for "after"', () => {
    // After Tuesday (1) is Wednesday (2).
    expect(nearMisses('days', 1, 2).slice(0, 3)).toEqual([0, 3, 1]);
  });

  it('offers the month after, the month before last, and the month itself first for "before"', () => {
    // Before January (0) is December (11).
    expect(nearMisses('months', 0, 11).slice(0, 3)).toEqual([1, 10, 0]);
  });

  it('never offers the answer and fills with the nearest others', () => {
    const misses = nearMisses('days', 3, 4);
    expect(misses).not.toContain(4);
    expect(misses.toSorted(byNumber)).toEqual([0, 1, 2, 3, 5, 6]);
  });
});
