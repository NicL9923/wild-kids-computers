import { describe, expect, it } from 'vitest';
import { areNear, generateLevel, MATCH_COLORS, MAX_DIFFICULTY, TOY_KINDS, type ColorMatchLevel } from './level.ts';

const byText = (a: string, b: string) => a.localeCompare(b);

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 7_919 + 11);

/** What makes a round fair: one box per color, a box for every toy, a toy for every box. */
function problems(level: ColorMatchLevel): string[] {
  const found: string[] = [];
  if (new Set(level.boxes).size !== level.boxes.length) found.push('a box color repeats');
  for (const toy of level.toys) if (!level.boxes.includes(toy.color)) found.push(`${toy.id} has no box`);
  for (const box of level.boxes)
    if (!level.toys.some((toy) => toy.color === box)) found.push(`the ${box} box stays empty`);
  if (new Set(level.toys.map((toy) => toy.id)).size !== level.toys.length) found.push('toy ids repeat');
  return found;
}

function nearPairs(level: ColorMatchLevel): number {
  let count = 0;
  level.boxes.forEach((color, index) => {
    for (const other of level.boxes.slice(index + 1)) if (areNear(color, other)) count += 1;
  });
  return count;
}

describe('generateLevel', () => {
  // The design table: boxes, toys, and whether two boxes are easy to mix up, per difficulty.
  it.each([
    [1, 2, 2, false],
    [2, 2, 3, false],
    [3, 3, 3, false],
    [4, 3, 4, false],
    [5, 3, 5, true],
    [6, 4, 5, true],
    [7, 4, 6, true],
    [8, 5, 6, true],
  ])('at difficulty %i gives %i boxes and %i toys, close colors %s', (difficulty, boxes, toys, near) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-3-5');
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
      expect(level.boxes).toHaveLength(boxes);
      expect(level.toys).toHaveLength(toys);
      expect(nearPairs(level) > 0, `seed ${String(seed)}`).toBe(near);
    }
  });

  it('uses every color and every kind of toy across rounds', () => {
    const colors = new Set(SEEDS.flatMap((seed) => generateLevel(seed, 3, 'band-3-5').boxes));
    expect([...colors].toSorted(byText)).toEqual([...MATCH_COLORS].toSorted(byText));
    const kinds = new Set(SEEDS.flatMap((seed) => generateLevel(seed, 7, 'band-3-5').toys.map((toy) => toy.kind)));
    expect([...kinds].toSorted(byText)).toEqual([...TOY_KINDS].toSorted(byText));
  });

  it('puts toys of one color in different places in the row across rounds', () => {
    const firstColors = new Set(
      SEEDS.map((seed) => {
        const level = generateLevel(seed, 1, 'band-3-5');
        return level.boxes.indexOf(level.toys[0]?.color ?? 'red');
      }),
    );
    expect([...firstColors].toSorted((a, b) => a - b)).toEqual([0, 1]);
  });

  it('repeats a round for the same seed and changes it for another', () => {
    expect(generateLevel(9, 5, 'band-3-5')).toEqual(generateLevel(9, 5, 'band-3-5'));
    expect(generateLevel(9, 5, 'band-3-5')).not.toEqual(generateLevel(10, 5, 'band-3-5'));
  });

  it.each([0, MAX_DIFFICULTY + 1, 2.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(
      `Color match has difficulty 1 to 8, not ${String(difficulty)}.`,
    );
  });
});

describe('areNear', () => {
  it('pairs colors either way round and keeps far colors apart', () => {
    expect(areNear('red', 'orange')).toBe(true);
    expect(areNear('orange', 'red')).toBe(true);
    expect(areNear('red', 'blue')).toBe(false);
    expect(MATCH_COLORS.filter((color) => areNear('green', color))).toEqual([]);
  });
});
