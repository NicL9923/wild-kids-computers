import { describe, expect, it } from 'vitest';
import type { Random } from '../../../../core/activityKit/random.ts';
import { expectNoPositionTell } from '../../../../core/activityKit/testing/positionTell.ts';
import { ANIMALS, HOMES, livesIn } from './homes.ts';
import { animalsFor, generateLevel, MAX_DIFFICULTY, type AnimalHomesLevel } from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 8_191 + 4);

/** What makes a round fair: each animal fits exactly one home on screen, its own. */
function problems(level: AnimalHomesLevel): string[] {
  const found: string[] = [];
  if (new Set(level.homes).size !== level.homes.length) found.push('a home repeats');
  if (new Set(level.animals.map((animal) => animal.id)).size !== level.animals.length) found.push('an animal repeats');
  if (level.animals.length !== level.homes.length) found.push('animals and homes differ in number');
  for (const animal of level.animals) {
    const fits = level.homes.filter((home) => livesIn(animal, home));
    if (fits.length !== 1 || fits[0] !== animal.home)
      found.push(`${animal.id} fits ${fits.join(' and ') || 'nothing'}`);
  }
  return found;
}

describe('generateLevel', () => {
  // The design table: pairs, and whether only familiar animals are used.
  it.each([
    [1, 2, true],
    [2, 3, true],
    [3, 3, false],
    [4, 4, true],
    [5, 4, false],
    [6, 5, false],
  ])('at difficulty %i gives %i fair pairs, familiar only: %s', (difficulty, pairs, familiarOnly) => {
    let unfamiliar = 0;
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-3-5');
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
      expect(level.animals).toHaveLength(pairs);
      unfamiliar += level.animals.filter((animal) => !animal.familiar).length;
    }
    expect(unfamiliar === 0).toBe(familiarOnly);
  });

  it.each([1, MAX_DIFFICULTY])('gives no home away by position at difficulty %i', (difficulty) => {
    const seeds = Array.from({ length: 600 }, (_, index) => index * 8_191 + 4);
    expectNoPositionTell(seeds, (seed) => {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      return { positions: level.animals.map((animal) => level.homes.indexOf(animal.home)) };
    });
  });

  it('uses every home and every animal across the hardest rounds', () => {
    const levels = SEEDS.map((seed) => generateLevel(seed, MAX_DIFFICULTY, 'band-6-8'));
    expect(new Set(levels.flatMap((level) => level.homes)).size).toBe(HOMES.length);
    expect(new Set(levels.flatMap((level) => level.animals.map((animal) => animal.id))).size).toBe(ANIMALS.length);
  });

  it('repeats a round for the same seed and changes it for another', () => {
    expect(generateLevel(3, 4, 'band-3-5')).toEqual(generateLevel(3, 4, 'band-3-5'));
    expect(generateLevel(3, 4, 'band-3-5')).not.toEqual(generateLevel(4, 4, 'band-3-5'));
  });

  it.each([0, MAX_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(
      `Animal homes has difficulty 1 to 6, not ${String(difficulty)}.`,
    );
  });
});

describe('animalsFor', () => {
  const inOrder: Random = {
    next: () => 0,
    int: (min) => min,
    pick: (items) => {
      for (const item of items) return item;
      throw new RangeError('empty');
    },
    shuffle: (items) => [...items],
    sample: (items, count) => items.slice(0, count),
  };

  it('skips an animal that would also fit another home on screen', () => {
    // The bird also lives in trees, so with a tree on screen the nest takes the eagle... which also
    // lives in trees, so no animal is left for the nest.
    expect(animalsFor(inOrder, ['nest', 'tree'], false)).toBeNull();
    expect(animalsFor(inOrder, ['nest', 'ocean'], false)?.map((animal) => animal.id)).toEqual(['bird', 'whale']);
    // With a tree on screen the bee cannot come, and the hive has no other animal.
    expect(animalsFor(inOrder, ['hive', 'tree'], false)).toBeNull();
    // The duck also nests, so with a nest on screen the pond takes the frog.
    expect(animalsFor(inOrder, ['pond', 'nest'], false)?.map((animal) => animal.id)).toEqual(['frog', 'bird']);
  });

  it('keeps to familiar animals when asked', () => {
    expect(animalsFor(inOrder, ['ocean'], true)?.map((animal) => animal.id)).toEqual(['whale']);
    expect(animalsFor(inOrder, ['cave', 'burrow'], true)).toBeNull();
    expect(animalsFor(inOrder, ['cave', 'burrow'], false)?.map((animal) => animal.id)).toEqual(['bat', 'rabbit']);
  });
});
