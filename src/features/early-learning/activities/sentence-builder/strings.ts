import { defineStrings, type SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { SENTENCES, type SentenceId } from './sentences.ts';

export const strings = defineStrings('sentence-builder', {
  title: { text: 'Sentence builder' },
  goal: { text: 'Puts written words in order to make a sentence it hears.', silent: 'parent' },
  instruction: { text: 'Put the words in order to make this sentence.' },
  places: { text: 'Places for the words', silent: 'decorative' },
  tiles: { text: 'Words to use', silent: 'decorative' },
  // One spoken string per sentence, keyed by its id.
  ...Object.fromEntries(SENTENCES.map((sentence) => [`sentence-${sentence.id}`, { text: sentence.text }])),
});

/** The spoken strings by key, for the lookup below. */
const byKey = new Map(Object.values(strings).map((handle) => [handle.key, handle]));

/** The spoken string for a sentence. Throws for one the list does not have. */
export function sentenceHandle(id: SentenceId): SpokenHandle {
  const handle = byKey.get(`sentence-${id}`);
  if (handle === undefined || handle.kind !== 'spoken') throw new RangeError(`No spoken string for "${id}".`);
  return handle;
}
