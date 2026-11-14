import { describe, expect, it } from 'vitest';
import { generateLevel, lookAlike, MAX_DIFFICULTY, soundAlike, type SightWordsLevel } from './level.ts';
import { FIRST_WORDS, LATER_WORDS } from './words.ts';

const SEEDS = Array.from({ length: 400 }, (_, index) => index * 1_999 + 37);

function problems(level: SightWordsLevel): string[] {
  const found: string[] = [];
  if (level.choices.filter((word) => word === level.answer).length !== 1) found.push('the answer is not offered once');
  if (new Set(level.choices).size !== level.choices.length) found.push('a word repeats');
  for (const word of level.choices) {
    if (soundAlike(level.answer, word)) found.push(`${word} sounds like ${level.answer}`);
  }
  return found;
}

const looksLike = (level: SightWordsLevel) => level.choices.filter((word) => lookAlike(level.answer, word)).length;

describe('generateLevel', () => {
  it.each([
    [1, 3],
    [2, 3],
    [3, 4],
    [4, 4],
    [5, 4],
    [6, 5],
    [7, 5],
    [8, 6],
  ])('at difficulty %i offers %i words, one of them the word said, none sounding like it', (difficulty, count) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
      expect(level.choices).toHaveLength(count);
    }
  });

  it('starts with the first words a reader meets and reaches the later list at difficulty 5', () => {
    const first = new Set<string>(FIRST_WORDS);
    const later = new Set<string>(LATER_WORDS);
    for (const seed of SEEDS) {
      for (const word of generateLevel(seed, 1, 'band-6-8').choices) expect(first.has(word)).toBe(true);
      for (const word of generateLevel(seed, 4, 'band-6-8').choices) expect(later.has(word)).toBe(false);
    }
    expect(SEEDS.some((seed) => later.has(generateLevel(seed, 5, 'band-6-8').answer))).toBe(true);
  });

  it('offers no look-alike words through difficulty 3', () => {
    for (const seed of SEEDS) expect(looksLike(generateLevel(seed, 3, 'band-6-8'))).toBe(0);
  });

  it.each([
    [4, 1, 0.9],
    [8, 2, 0.6],
  ])('at difficulty %i offers %i look-alike words in most rounds', (difficulty, wanted, share) => {
    const counts = SEEDS.map((seed) => looksLike(generateLevel(seed, difficulty, 'band-6-8')));
    expect(Math.max(...counts)).toBe(wanted);
    expect(counts.filter((count) => count === wanted).length).toBeGreaterThan(SEEDS.length * share);
  });

  it('never offers to, two, and too together, and asks for each of them', () => {
    const homophones = ['to', 'two', 'too'];
    const asked = new Set<string>();
    for (let difficulty = 1; difficulty <= MAX_DIFFICULTY; difficulty += 1) {
      for (const seed of SEEDS) {
        const level = generateLevel(seed, difficulty, 'band-6-8');
        expect(level.choices.filter((word) => homophones.includes(word)).length).toBeLessThan(2);
        if (homophones.includes(level.answer)) asked.add(level.answer);
      }
    }
    expect([...asked].toSorted()).toEqual(['to', 'too', 'two']);
  });

  it('puts the answer in every position over many rounds', () => {
    const positions = new Set(
      SEEDS.map((seed) => {
        const level = generateLevel(seed, 8, 'band-6-8');
        return level.choices.indexOf(level.answer);
      }),
    );
    expect([...positions].toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it.each([0, MAX_DIFFICULTY + 1, 4.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-6-8')).toThrow(/difficulty 1 to 8, not/);
  });
});

describe('lookAlike and soundAlike', () => {
  it.each([
    ['was', 'saw', true],
    ['on', 'no', true],
    ['the', 'they', true],
    ['I', 'in', true],
    ['the', 'see', false],
    ['was', 'was', false],
  ] as const)('%s and %s look alike: %s', (a, b, expected) => {
    expect(lookAlike(a, b)).toBe(expected);
  });

  it.each([
    ['to', 'two', true],
    ['for', 'four', true],
    ['no', 'know', true],
    ['no', 'on', false],
    ['to', 'to', false],
  ] as const)('%s and %s sound alike: %s', (a, b, expected) => {
    expect(soundAlike(a, b)).toBe(expected);
  });
});
