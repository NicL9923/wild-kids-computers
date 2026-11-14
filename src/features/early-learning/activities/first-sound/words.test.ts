import { describe, expect, it } from 'vitest';
import { strings as emojiNames } from '../../../../core/strings/shared/emoji.ts';
import { firstLetter, START_LETTERS } from './level.ts';
import { WORDS } from './words.ts';

describe('the first sound word list', () => {
  it('has no word twice', () => {
    expect(new Set(WORDS).size).toBe(WORDS.length);
  });

  it('uses pictures whose spoken name is one lowercase word, so the clip says just that word', () => {
    for (const word of WORDS) {
      expect(emojiNames[word].kind, word).toBe('spoken');
      expect(emojiNames[word].text, word).toMatch(/^[a-z]+(?:-[a-z]+)?$/);
    }
  });

  it('starts no word with a digraph, a soft c or g, or a silent letter', () => {
    for (const word of WORDS) {
      const name = emojiNames[word].text;
      expect(name, word).not.toMatch(/^(sh|ch|th|ph|kn|wr|gn|ce|ci|cy|ge|gi|gy)/);
    }
  });

  // The letters a child can be asked: no i, q, or x, which no clear picture starts with.
  it('covers these first letters', () => {
    expect(START_LETTERS.join('')).toBe('abcdefghjklmnoprstuvwyz');
  });

  it('reads the first letter from the spoken name', () => {
    expect(firstLetter('cat')).toBe('c');
    expect(firstLetter('yo-yo')).toBe('y');
  });
});
