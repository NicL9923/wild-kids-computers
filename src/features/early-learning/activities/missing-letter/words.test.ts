import { describe, expect, it } from 'vitest';
import { strings as emojiNames } from '../../../../core/strings/shared/emoji.ts';
import { FOUR_LETTER_WORDS, LONG_WORDS, SHORT_WORDS } from './words.ts';

describe('the missing letter lists', () => {
  const all = [...SHORT_WORDS, ...FOUR_LETTER_WORDS, ...LONG_WORDS];

  it('have no word twice', () => {
    expect(new Set(all).size).toBe(all.length);
  });

  it('use pictures whose spoken name is the plain lowercase word', () => {
    for (const word of all) {
      expect(emojiNames[word].kind, word).toBe('spoken');
      expect(emojiNames[word].text, word).toMatch(/^[a-z]+$/);
    }
  });

  it.each([
    ['short', SHORT_WORDS, 3, 3],
    ['four-letter', FOUR_LETTER_WORDS, 4, 4],
    ['long', LONG_WORDS, 5, 6],
  ] as const)('keep the %s list from %i to %i letters', (_name, words, shortest, longest) => {
    for (const word of words) {
      expect(emojiNames[word].text.length, word).toBeGreaterThanOrEqual(shortest);
      expect(emojiNames[word].text.length, word).toBeLessThanOrEqual(longest);
    }
  });

  it('spell every word the way it sounds: no silent e, no vowel pairs, no soft c or g', () => {
    for (const word of all) expect(emojiNames[word].text, word).not.toMatch(/[aeiou]{2}|[^aeiou]e$|c[eiy]|g[eiy]/);
  });

  it('give every short word a vowel in the middle, for the middle-gap rounds', () => {
    for (const word of SHORT_WORDS) expect(emojiNames[word].text.charAt(1), word).toMatch(/[aeiou]/);
  });
});
