import { describe, expect, it } from 'vitest';
import { strings as emojiNames } from '../../../../core/strings/shared/emoji.ts';
import { SENTENCES, wordsOf } from './sentences.ts';
import { sentenceHandle } from './strings.ts';

describe('the sentences', () => {
  it('have no id or text twice', () => {
    expect(new Set(SENTENCES.map((sentence) => sentence.id)).size).toBe(SENTENCES.length);
    expect(new Set(SENTENCES.map((sentence) => sentence.text)).size).toBe(SENTENCES.length);
  });

  it('are three to six plain words with a capital first and a period last', () => {
    for (const sentence of SENTENCES) {
      expect(sentence.text, sentence.id).toMatch(/^[A-Z][a-z]*( [a-zI][a-z]*){2,5}\.$/);
      expect(wordsOf(sentence).length, sentence.id).toBeGreaterThanOrEqual(3);
      expect(wordsOf(sentence).length, sentence.id).toBeLessThanOrEqual(6);
    }
  });

  it('take the id from the words, so a changed sentence gets a new id', () => {
    for (const sentence of SENTENCES) {
      expect(sentence.id).toBe(wordsOf(sentence).join('-').toLowerCase());
    }
  });

  it('never repeat a word in one sentence, so each tile has one place', () => {
    for (const sentence of SENTENCES) {
      const words = wordsOf(sentence);
      expect(new Set(words).size, sentence.id).toBe(words.length);
    }
  });

  it('have a picture with a spoken name and a spoken string each', () => {
    for (const sentence of SENTENCES) {
      expect(emojiNames[sentence.picture].kind).toBe('spoken');
      expect(sentenceHandle(sentence.id).text).toBe(sentence.text);
    }
  });

  it('cover every length from three to six words', () => {
    const lengths = new Set(SENTENCES.map((sentence) => wordsOf(sentence).length));
    expect([...lengths].toSorted((a, b) => a - b)).toEqual([3, 4, 5, 6]);
  });

  it('rejects an id the list does not have', () => {
    // @ts-expect-error -- not a sentence id; the guard catches a list typo at runtime.
    expect(() => sentenceHandle('no-such-sentence')).toThrow('No spoken string for "no-such-sentence".');
  });
});
