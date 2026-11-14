import { describe, expect, it } from 'vitest';
import { strings as emojiNames } from '../../../../core/strings/shared/emoji.ts';
import { RHYME_SETS } from './rhymes.ts';

describe('the rhyme sets', () => {
  const words = RHYME_SETS.flatMap((set) => set.words);

  it('put no word in two sets and repeat no rhyme', () => {
    expect(new Set(words).size).toBe(words.length);
    expect(new Set(RHYME_SETS.map((set) => set.rhyme)).size).toBe(RHYME_SETS.length);
  });

  it('give every set at least two words, so it can make a pair', () => {
    for (const set of RHYME_SETS) expect(set.words.length, set.rhyme).toBeGreaterThanOrEqual(2);
  });

  it('use pictures whose spoken name is one word, the word that rhymes', () => {
    for (const word of words) {
      expect(emojiNames[word].kind, word).toBe('spoken');
      expect(emojiNames[word].text, word).toMatch(/^[a-z]+$/);
    }
  });

  // A spelling check that catches a set typed into the wrong rhyme. Sound is checked by ear.
  it.each(RHYME_SETS.map((set) => [set.rhyme, set.words] as const))(
    'spells every %s word with a matching ending, or is a listed sound-alike',
    (rhyme, setWords) => {
      const soundAlikes = new Set(['whale', 'key', 'socks', 'bear', 'pear', 'bread', 'eye', 'deer', 'phone', 'guitar']);
      for (const word of setWords) {
        if (soundAlikes.has(word)) continue;
        expect(emojiNames[word].text.endsWith(rhyme), word).toBe(true);
      }
    },
  );

  it('have twelve vowel sounds, so six pairs can all differ', () => {
    expect(new Set(RHYME_SETS.map((set) => set.vowel)).size).toBe(12);
  });
});
