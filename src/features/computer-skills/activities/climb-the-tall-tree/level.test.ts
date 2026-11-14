import { describe, expect, it } from 'vitest';
import {
  aboveFirstScreen,
  ANIMALS,
  directionTo,
  generateLevel,
  GROUND,
  MAX_TREE_DIFFICULTY,
  STEPS,
  stepFor,
  TOP_MARGIN,
  TREE_WIDTH,
  TRUNK,
  VIEW_HEIGHT,
  type TreeLevel,
} from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 1_548_583 + 3);
const DIFFICULTIES = Array.from({ length: MAX_TREE_DIFFICULTY }, (_, index) => index + 1);

/** Every rule that makes a tree fair, checked from the level alone. */
function problems(level: TreeLevel): string[] {
  const found: string[] = [];
  const r = level.size / 2;
  level.perches.forEach((perch, index) => {
    if (perch.x - r < 0 || perch.x + r > TREE_WIDTH) found.push(`${perch.id} leaves the tree sideways`);
    if (perch.y - r < TOP_MARGIN / 2 || perch.y + r > level.height - GROUND) found.push(`${perch.id} leaves the tree`);
    // On a branch, never on the trunk.
    if (perch.x + r > TRUNK.left && perch.x - r < TRUNK.right) found.push(`${perch.id} sits on the trunk`);
    for (const other of level.perches.slice(index + 1)) {
      if (Math.hypot(perch.x - other.x, perch.y - other.y) < level.size * 1.5)
        found.push(`${perch.id} crowds ${other.id}`);
    }
  });
  if (new Set(level.perches.map((perch) => perch.animal)).size !== level.perches.length)
    found.push('an animal repeats');
  if (new Set(level.finds).size !== level.finds.length) found.push('a find repeats');
  for (const id of level.finds) {
    const perch = level.perches.find((each) => each.id === id);
    if (perch === undefined) found.push(`${id} is not on the tree`);
    else if (!aboveFirstScreen(level, perch)) found.push(`${id} shows without a scroll`);
  }
  return found;
}

describe('generateLevel', () => {
  it.each(DIFFICULTIES)(
    'at difficulty %i gives a fair tree that needs a scroll for every find, for every seed',
    (difficulty) => {
      const step = stepFor(difficulty);
      for (const seed of SEEDS) {
        const level = generateLevel(seed, difficulty, 'band-6-8');
        expect(level.perches).toHaveLength(step.animals);
        expect(level.finds).toHaveLength(step.finds);
        expect(problems(level), `seed ${String(seed)}`).toEqual([]);
      }
    },
  );

  it('starts with a tree two screens tall and one animal to find', () => {
    const level = generateLevel(1, 1, 'band-6-8');
    expect(level.height).toBeGreaterThanOrEqual(2 * VIEW_HEIGHT);
    expect(level.finds).toHaveLength(1);
  });

  it('keeps animals larger than the band target at a 1280 by 800 window', () => {
    // The tree is at least 900 pixels wide there, so a unit is at least 0.9 pixels.
    expect(Math.min(...STEPS.map((step) => step.size)) * 0.9).toBeGreaterThanOrEqual(56);
  });

  it('puts branches on both sides and finds at many heights, across seeds', () => {
    const levels = SEEDS.slice(0, 80).map((seed) => generateLevel(seed, 6, 'band-6-8'));
    const firstSides = new Set(levels.map((level) => (level.perches[0]?.x ?? 0) < TRUNK.left));
    expect(firstSides.size).toBe(2);
    const findHeights = new Set(levels.map((level) => level.perches.find((perch) => perch.id === level.finds[0])?.id));
    expect(findHeights.size).toBeGreaterThan(3);
    // Branches take turns: each animal sits on the other side of the trunk from the one before.
    for (const level of levels) {
      const sides = level.perches.map((perch) => perch.x < TRUNK.left);
      expect(sides.every((left, index) => index === 0 || left !== sides[index - 1])).toBe(true);
    }
    expect(new Set(levels.map((level) => level.perches[0]?.y)).size).toBeGreaterThan(20);
    const animals = new Set(levels.flatMap((level) => level.perches.map((perch) => perch.animal)));
    expect(animals.size).toBe(ANIMALS.length);
  });

  it('changes by small steps: 300 units taller, one more animal, at most one more find', () => {
    for (let index = 1; index < STEPS.length; index += 1) {
      const before = STEPS[index - 1];
      const after = STEPS[index];
      if (before === undefined || after === undefined) throw new Error('missing step');
      expect(after.height - before.height).toBe(300);
      expect(after.animals - before.animals).toBe(1);
      expect(after.finds - before.finds).toBeGreaterThanOrEqual(0);
      expect(after.finds - before.finds).toBeLessThanOrEqual(1);
    }
  });

  it.each([0, MAX_TREE_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-6-8')).toThrow(/difficulty 1 to 6, not/);
  });
});

describe('aboveFirstScreen', () => {
  const level = { height: 1400, size: 100 };
  it.each([
    ['wholly above the first screen', 650, true],
    ['one unit into the first screen', 651, false],
    ['at the ground', 1300, false],
  ] as const)('counts a perch %s', (_label, y, expected) => {
    expect(aboveFirstScreen(level, { y })).toBe(expected);
  });
});

describe('directionTo', () => {
  it.each([
    ['above the window', 399, 'up'],
    ['at the window top', 400, 'here'],
    ['at the window bottom', 400 + VIEW_HEIGHT, 'here'],
    ['below the window', 401 + VIEW_HEIGHT, 'down'],
  ] as const)('points to a perch %s', (_label, y, expected) => {
    expect(directionTo({ y }, 400)).toBe(expected);
  });
});
