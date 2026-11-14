import { describe, expect, it } from 'vitest';
import { strings as emojiNames } from '../../../../core/strings/shared/emoji.ts';
import { sameSound, VOWELS } from '../../reading/alphabet.ts';
import { confusable, generateLevel, MAX_DIFFICULTY, type MissingLetterLevel } from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 1_597 + 41);

/** What makes a round fair: the gap is a letter of the word, offered once, and nothing else fits by sound. */
function problems(level: MissingLetterLevel): string[] {
  const found: string[] = [];
  if (emojiNames[level.word].text !== level.letters.join('')) found.push('the letters do not spell the word');
  if (level.letters[level.gap] !== level.answer) found.push('the answer is not the missing letter');
  if (level.choices.filter((letter) => letter === level.answer).length !== 1)
    found.push('the answer is not offered once');
  if (new Set(level.choices).size !== level.choices.length) found.push('a letter repeats');
  for (const letter of level.choices) {
    if (sameSound(level.answer, letter)) found.push(`${letter} says the same sound as ${level.answer}`);
    // A vowel gap offers vowels, a consonant gap consonants: a wrong pick is never a different kind of letter.
    if (VOWELS.includes(letter) !== VOWELS.includes(level.answer)) found.push(`${letter} is the wrong kind of letter`);
  }
  return found;
}

const near = (level: MissingLetterLevel) => level.choices.filter((letter) => confusable(level.answer, letter)).length;

describe('confusable', () => {
  it.each([
    ['b', 'p', true],
    ['b', 'd', true],
    ['e', 'i', true],
    ['o', 'e', false],
    ['m', 's', false],
  ] as const)('counts %s and %s as easy to mix up: %s', (a, b, expected) => {
    expect(confusable(a, b)).toBe(expected);
  });
});

describe('generateLevel', () => {
  it.each([
    [1, 3, 3, 3],
    [2, 3, 3, 3],
    [3, 3, 3, 3],
    [4, 3, 3, 4],
    [5, 4, 4, 4],
    [6, 4, 4, 4],
    [7, 5, 6, 5],
    [8, 5, 6, 5],
  ])(
    'at difficulty %i uses words of %i to %i letters and offers %i fair letters',
    (difficulty, shortest, longest, count) => {
      for (const seed of SEEDS) {
        const level = generateLevel(seed, difficulty, 'band-6-8');
        expect(problems(level), `seed ${String(seed)}`).toEqual([]);
        expect(level.letters.length).toBeGreaterThanOrEqual(shortest);
        expect(level.letters.length).toBeLessThanOrEqual(longest);
        expect(level.choices).toHaveLength(count);
      }
    },
  );

  it.each([
    [1, 'first', [0]],
    [2, 'last', [2]],
    [3, 'middle vowel', [1]],
    [4, 'any', [0, 1, 2]],
  ] as const)('at difficulty %i leaves out the %s letter', (difficulty, _name, gaps) => {
    const seen = new Set(SEEDS.map((seed) => generateLevel(seed, difficulty, 'band-6-8').gap));
    expect([...seen].toSorted((a, b) => a - b)).toEqual(gaps);
  });

  it('never offers q or x as a wrong letter, though x can be the answer, as in fox', () => {
    const answers = new Set<string>();
    for (let difficulty = 1; difficulty <= MAX_DIFFICULTY; difficulty += 1) {
      for (const seed of SEEDS) {
        const level = generateLevel(seed, difficulty, 'band-6-8');
        answers.add(level.answer);
        const wrong = level.choices.filter((letter) => letter !== level.answer);
        expect(wrong).not.toContain('q');
        expect(wrong).not.toContain('x');
      }
    }
    expect(answers).toContain('x');
  });

  it('offers only vowels for the middle vowel', () => {
    for (const seed of SEEDS) {
      for (const letter of generateLevel(seed, 3, 'band-6-8').choices) expect(VOWELS).toContain(letter);
    }
  });

  it('keeps look-alike and sound-alike letters out until difficulty 6', () => {
    for (const seed of SEEDS) expect(near(generateLevel(seed, 5, 'band-6-8'))).toBe(0);
  });

  it.each([
    [6, 1],
    [8, 2],
  ])('at difficulty %i offers up to %i look-alike or sound-alike letters', (difficulty, most) => {
    const counts = SEEDS.map((seed) => near(generateLevel(seed, difficulty, 'band-6-8')));
    expect(Math.max(...counts)).toBe(most);
    // Not every letter has two close neighbors; the choice picker test covers the exact count.
    expect(counts.filter((count) => count === most).length).toBeGreaterThan(SEEDS.length / 5);
  });

  it('puts the answer in every position over many rounds', () => {
    const positions = new Set(
      SEEDS.map((seed) => {
        const level = generateLevel(seed, 8, 'band-6-8');
        return level.choices.indexOf(level.answer);
      }),
    );
    expect([...positions].toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('repeats a round for the same seed', () => {
    expect(generateLevel(13, 6, 'band-6-8')).toEqual(generateLevel(13, 6, 'band-6-8'));
  });

  it.each([0, MAX_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-6-8')).toThrow(/difficulty 1 to 8, not/);
  });
});
