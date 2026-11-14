import { describe, expect, it } from 'vitest';
import { strings as emojiNames } from '../../../../core/strings/shared/emoji.ts';
import { LONGER_WORDS, SHORT_WORDS } from './words.ts';

describe('the build the word lists', () => {
  const all = [...SHORT_WORDS, ...LONGER_WORDS];

  it('have no word twice', () => {
    expect(new Set(all).size).toBe(all.length);
  });

  it('use pictures whose spoken name is the plain lowercase word to spell', () => {
    for (const word of all) {
      expect(emojiNames[word].kind, word).toBe('spoken');
      expect(emojiNames[word].text, word).toMatch(/^[a-z]+$/);
    }
  });

  it('keep the short list to three letters and the longer list to four to six', () => {
    for (const word of SHORT_WORDS) expect(emojiNames[word].text, word).toHaveLength(3);
    for (const word of LONGER_WORDS) {
      expect(emojiNames[word].text.length, word).toBeGreaterThanOrEqual(4);
      expect(emojiNames[word].text.length, word).toBeLessThanOrEqual(6);
    }
  });

  it('spell every word the way it sounds: no silent e and no vowel pairs', () => {
    for (const word of all) expect(emojiNames[word].text, word).not.toMatch(/[aeiou]{2}|[^aeiou]e$/);
  });
});
