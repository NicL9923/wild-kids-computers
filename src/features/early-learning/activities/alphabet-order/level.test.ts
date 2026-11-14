import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import { ALPHABET, type Letter } from '../../reading/alphabet.ts';
import { FAR, generateLevel, MAX_DIFFICULTY, NEAR, type AlphabetOrderLevel } from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 4_099 + 23);
const position = (letter: Letter) => ALPHABET.indexOf(letter);

type Next = Extract<AlphabetOrderLevel, { mode: 'next' }>;
type Order = Extract<AlphabetOrderLevel, { mode: 'order' }>;

function next(seed: number, difficulty: number, band: Band = 'band-3-5'): Next {
  const level = generateLevel(seed, difficulty, band);
  if (level.mode !== 'next') throw new Error(`difficulty ${String(difficulty)} is not a next-letter round`);
  return level;
}

function order(seed: number, difficulty: number, band: Band = 'band-6-8'): Order {
  const level = generateLevel(seed, difficulty, band);
  if (level.mode !== 'order') throw new Error(`difficulty ${String(difficulty)} is not an ordering round`);
  return level;
}

describe('next-letter rounds', () => {
  it.each([
    [1, 3, 2],
    [2, 3, 3],
    [3, 2, 3],
  ])('at difficulty %i show a run of %i and %i letters, exactly one of them next', (difficulty, run, count) => {
    for (const seed of SEEDS) {
      const level = next(seed, difficulty);
      expect(level.run).toHaveLength(run);
      expect(level.choices).toHaveLength(count);
      // The run is unbroken and the answer follows it.
      const first = position(level.run[0] ?? 'z');
      level.run.forEach((letter, offset) => expect(position(letter)).toBe(first + offset));
      expect(position(level.answer)).toBe(first + run);
      expect(level.choices.filter((letter) => letter === level.answer)).toHaveLength(1);
      expect(new Set(level.choices).size).toBe(count);
      // No choice is a letter already shown in the run.
      for (const letter of level.choices) expect(level.run).not.toContain(letter);
    }
  });

  it('starts the youngest near the beginning of the alphabet, where the song is surest', () => {
    const answers = SEEDS.map((seed) => position(next(seed, 1).answer));
    expect(Math.min(...answers)).toBe(3);
    expect(Math.max(...answers)).toBe(8);
  });

  it('reaches the end of the alphabet by difficulty 3', () => {
    const answers = SEEDS.map((seed) => next(seed, 3).answer);
    expect(answers).toContain('z');
  });

  it(`keeps wrong letters ${String(FAR)} or more away early, and within ${String(NEAR)} at difficulty 3`, () => {
    for (const seed of SEEDS) {
      for (const difficulty of [1, 2]) {
        const level = next(seed, difficulty);
        for (const letter of level.choices.filter((each) => each !== level.answer)) {
          expect(Math.abs(position(letter) - position(level.answer))).toBeGreaterThanOrEqual(FAR);
        }
      }
      const hard = next(seed, 3);
      for (const letter of hard.choices) {
        expect(Math.abs(position(letter) - position(hard.answer))).toBeLessThanOrEqual(NEAR);
      }
    }
  });

  it(`offers wrong letters exactly ${String(FAR)} away early, so the easy rounds stay close enough to teach`, () => {
    const distances = SEEDS.flatMap((seed) => {
      const level = next(seed, 1);
      return level.choices.map((letter) => Math.abs(position(letter) - position(level.answer)));
    });
    expect(distances).toContain(FAR);
  });

  it('puts the answer in every position', () => {
    const positions = new Set(SEEDS.map((seed) => next(seed, 2).choices.indexOf(next(seed, 2).answer)));
    expect([...positions].toSorted((a, b) => a - b)).toEqual([0, 1, 2]);
  });
});

describe('ordering rounds', () => {
  it.each([
    [4, 3, 1],
    [5, 4, 1],
    [6, 4, 3],
    [7, 5, 3],
    [8, 6, 3],
  ])('at difficulty %i give %i letters with steps of at most %i, never already in order', (difficulty, count, gap) => {
    const steps = new Set<number>();
    for (const seed of SEEDS) {
      const level = order(seed, difficulty);
      expect(level.letters).toHaveLength(count);
      expect(new Set(level.letters).size).toBe(count);
      for (let index = 1; index < count; index += 1) {
        const step = position(level.letters[index] ?? 'a') - position(level.letters[index - 1] ?? 'z');
        expect(step).toBeGreaterThanOrEqual(1);
        expect(step).toBeLessThanOrEqual(gap);
        steps.add(step);
      }
      expect(level.shuffled.toSorted()).toEqual([...level.letters]);
      expect(level.shuffled).not.toEqual(level.letters);
    }
    expect(Math.max(...steps)).toBe(gap);
  });

  it('starts each ordering round in a different order', () => {
    const firsts = new Set(SEEDS.map((seed) => order(seed, 4).shuffled.indexOf(order(seed, 4).letters[0] ?? 'a')));
    expect([...firsts].toSorted((a, b) => a - b)).toEqual([0, 1, 2]);
    const orders = new Set(
      SEEDS.map((seed) =>
        order(seed, 4)
          .shuffled.map((letter) => order(seed, 4).letters.indexOf(letter))
          .join(''),
      ),
    );
    // Every order of three but the sorted one.
    expect([...orders].toSorted()).toEqual(['021', '102', '120', '201', '210']);
  });

  it('reaches both ends of the alphabet', () => {
    const letters = SEEDS.flatMap((seed) => order(seed, 8).letters);
    expect(letters).toContain('a');
    expect(letters).toContain('z');
  });
});

describe('generateLevel', () => {
  // The band edges in activity.ts: the youngest start on the next letter and end on three in order.
  it.each<[Band, number, AlphabetOrderLevel['mode']]>([
    ['band-3-5', 1, 'next'],
    ['band-3-5', 4, 'order'],
    ['band-6-8', 2, 'next'],
    ['band-6-8', 8, 'order'],
  ])('in %s at difficulty %i plays a %s round', (band, difficulty, mode) => {
    expect(generateLevel(1, difficulty, band).mode).toBe(mode);
  });

  it('repeats a round for the same seed', () => {
    expect(generateLevel(77, 7, 'band-6-8')).toEqual(generateLevel(77, 7, 'band-6-8'));
  });

  it.each([0, MAX_DIFFICULTY + 1, 3.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 8, not/);
  });
});
