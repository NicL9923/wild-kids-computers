import { describe, expect, it } from 'vitest';
import { emojiNames } from '../../../../core/strings/shared/index.ts';
import activity from './activity.ts';
import { generateLevel, lettersOf, LONG_WORDS, MAX_WORD_DIFFICULTY, SHORT_WORDS, STEPS } from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 7919 + 5);
const DIFFICULTIES = Array.from({ length: MAX_WORD_DIFFICULTY }, (_, index) => index + 1);

describe('generateLevel', () => {
  it.each(DIFFICULTIES)('at difficulty %i gives distinct words from the right list', (difficulty) => {
    const step = STEPS[difficulty - 1];
    const pool: readonly string[] =
      step?.pool === 'short' ? SHORT_WORDS : step?.pool === 'long' ? LONG_WORDS : [...SHORT_WORDS, ...LONG_WORDS];
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      expect(level.words).toHaveLength(step?.count ?? -1);
      expect(new Set(level.words.map((word) => word.id)).size).toBe(level.words.length);
      for (const word of level.words) {
        expect(pool).toContain(word.id);
        // The letters spell the very word the voice says, so typing what is heard is right.
        expect(word.letters.join('')).toBe(emojiNames[word.id].text);
      }
      expect(level.help).toBe(step?.help);
    }
  });

  it('adds words, lengthens them, and takes away help one small step at a time', () => {
    expect(STEPS.map((step) => `${String(step.count)} ${step.pool} ${step.help}`)).toEqual([
      '2 short key',
      '3 short key',
      '3 mixed key',
      '3 mixed row',
      '3 long row',
      '4 long none',
    ]);
  });

  it('keeps short words to three letters and long words to four', () => {
    // The lengths are the difficulty: a six-year-old types three letters before four.
    for (const word of SHORT_WORDS) expect(word).toHaveLength(3);
    for (const word of LONG_WORDS) expect(word).toHaveLength(4);
  });

  it('serves the whole band range, and both ends give a level', () => {
    const range = activity.kind === 'rounds' ? activity.difficulty['band-6-8'] : undefined;
    expect(range).toEqual({ min: 1, max: MAX_WORD_DIFFICULTY });
    expect(generateLevel(3, 1, 'band-6-8').words.length).toBeGreaterThan(0);
    expect(generateLevel(3, MAX_WORD_DIFFICULTY, 'band-6-8').words.length).toBeGreaterThan(0);
  });

  it('reaches every word in the lists across seeds', () => {
    const seen = new Set(SEEDS.flatMap((seed) => generateLevel(seed, 3, 'band-6-8').words.map((word) => word.id)));
    expect(seen.size).toBe(SHORT_WORDS.length + LONG_WORDS.length);
  });

  it.each([0, MAX_WORD_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-6-8')).toThrow(/difficulty 1 to 6, not/);
  });
});

describe('lettersOf', () => {
  it('splits a word into letters', () => {
    expect(lettersOf('frog')).toEqual(['f', 'r', 'o', 'g']);
  });

  it.each(['Cat', 'ice cream', 'a1'])('rejects %s, which has something other than small letters', (word) => {
    expect(() => lettersOf(word)).toThrow(/is not plain lower-case letters/);
  });
});
