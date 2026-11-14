import { describe, expect, it } from 'vitest';
import { wordHandle } from './strings.ts';
import { ALL_WORDS, HOMOPHONES } from './words.ts';

describe('the sight word lists', () => {
  it('have no word twice', () => {
    expect(new Set(ALL_WORDS).size).toBe(ALL_WORDS.length);
  });

  it('give every word its own spoken string that says just the word', () => {
    for (const word of ALL_WORDS) {
      expect(wordHandle(word).text, word).toBe(word);
      expect(wordHandle(word).id, word).toBe(`sight-words.word-${word}`);
    }
  });

  it('list only words that are in the lists as homophones', () => {
    for (const group of HOMOPHONES) {
      expect(group.length).toBeGreaterThanOrEqual(2);
      for (const word of group) expect(ALL_WORDS).toContain(word);
    }
  });

  it('rejects a word the lists do not have', () => {
    // @ts-expect-error -- "zebra" is not a sight word; the guard catches a list typo at runtime.
    expect(() => wordHandle('zebra')).toThrow('No spoken string for "zebra".');
  });

  it('leave out "a", which a voice says like the letter name', () => {
    expect(ALL_WORDS).not.toContain('a');
  });
});
