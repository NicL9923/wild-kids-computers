import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import { chooseSets, generateLevel, MAX_DIFFICULTY, TIERS, type RhymingPairsLevel } from './level.ts';
import { RHYME_SETS } from './rhymes.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 3_331 + 29);

const setOf = (word: string) => RHYME_SETS.find((set) => (set.words as readonly string[]).includes(word));

/** What makes a board fair: every card has exactly one partner, the card that rhymes with it. */
function problems(level: RhymingPairsLevel): string[] {
  const found: string[] = [];
  if (new Set(level.cards.map((card) => card.word)).size !== level.cards.length) found.push('a picture repeats');
  for (const card of level.cards) {
    if (setOf(card.word)?.rhyme !== card.rhyme) found.push(`${card.word} is not in the ${card.rhyme} set`);
    const partners = level.cards.filter((other) => other !== card && other.rhyme === card.rhyme);
    if (partners.length !== 1) found.push(`${card.word} has ${String(partners.length)} partners`);
  }
  return found;
}

/** How many pairs of rhymes on the board share a vowel. */
function sharedVowels(level: RhymingPairsLevel): number {
  const vowels = [...new Set(level.cards.map((card) => card.rhyme))].map((rhyme) => {
    const set = RHYME_SETS.find((each) => each.rhyme === rhyme);
    return set?.vowel ?? rhyme;
  });
  return vowels.length - new Set(vowels).size;
}

describe('generateLevel', () => {
  it.each([
    [1, 2, 0],
    [2, 3, 0],
    [3, 4, 0],
    [4, 4, 1],
    [5, 5, 1],
    [6, 6, 1],
  ])('at difficulty %i lays out %i pairs, %i of them sharing a vowel', (difficulty, pairs, shared) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
      expect(level.cards).toHaveLength(pairs * 2);
      expect(sharedVowels(level), `seed ${String(seed)}`).toBe(shared);
    }
  });

  // The band edges in activity.ts.
  it.each<[Band, number, number]>([
    ['band-3-5', 1, 4],
    ['band-3-5', 3, 8],
    ['band-6-8', 2, 6],
    ['band-6-8', 6, 12],
  ])('in %s at difficulty %i shows %i cards', (band, difficulty, cards) => {
    expect(generateLevel(1, difficulty, band).cards).toHaveLength(cards);
  });

  it('uses every rhyme set and every word over many boards', () => {
    const words = new Set(SEEDS.flatMap((seed) => generateLevel(seed, 6, 'band-6-8').cards.map((card) => card.word)));
    expect(words.size).toBe(RHYME_SETS.flatMap((set) => set.words).length);
  });

  it('shuffles the cards, so a pair sits side by side only some of the time', () => {
    const adjacent = SEEDS.filter((seed) => {
      const [first, second] = generateLevel(seed, 1, 'band-3-5').cards;
      return first?.rhyme === second?.rhyme;
    });
    expect(adjacent.length).toBeGreaterThan(0);
    expect(adjacent.length).toBeLessThan(SEEDS.length / 2);
  });

  it('repeats a board for the same seed', () => {
    expect(generateLevel(5, 4, 'band-6-8')).toEqual(generateLevel(5, 4, 'band-6-8'));
  });

  it.each([0, MAX_DIFFICULTY + 1, 1.25])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 6, not/);
  });
});

describe('chooseSets', () => {
  it('picks the shared vowel from every vowel that has two sets', () => {
    const tier = TIERS[3];
    if (tier === undefined) throw new Error('Difficulty 4 exists');
    const vowels = new Set(
      SEEDS.map((seed) => {
        const [first] = chooseSets(createRandom(seed), tier);
        return first?.vowel;
      }),
    );
    expect([...vowels].toSorted((a, b) => String(a).localeCompare(String(b)))).toEqual([
      'long o',
      'short e',
      'short o',
    ]);
  });
});
