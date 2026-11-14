import { defineStrings, type SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { ALL_WORDS, type SightWord } from './words.ts';

export const strings = defineStrings('sight-words', {
  title: { text: 'Sight words' },
  goal: { text: 'Hears a common word and finds it written among others.', silent: 'parent' },
  instruction: { text: 'Click the word you hear.' },
  hearAgain: { text: 'Hear the word again', silent: 'decorative' },
  words: { text: 'Words to choose from', silent: 'decorative' },
  // One spoken string per sight word, keyed by the word, so the voice says each word alone.
  ...Object.fromEntries(ALL_WORDS.map((word) => [`word-${word}`, { text: word }])),
});

/** The spoken strings by key, for the lookup below. */
const byKey = new Map(Object.values(strings).map((handle) => [handle.key, handle]));

/** The spoken string for a sight word. Throws for one the list does not have. */
export function wordHandle(word: SightWord): SpokenHandle {
  const handle = byKey.get(`word-${word}`);
  if (handle === undefined || handle.kind !== 'spoken') throw new RangeError(`No spoken string for "${word}".`);
  return handle;
}
