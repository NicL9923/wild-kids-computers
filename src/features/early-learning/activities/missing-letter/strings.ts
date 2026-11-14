import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('missing-letter', {
  title: { text: 'Missing letter' },
  goal: { text: 'Hears a word and picks the letter that completes its spelling.', silent: 'parent' },
  instruction: { text: 'Which letter is missing?' },
  word: { text: 'The word', silent: 'decorative' },
  letters: { text: 'Letters to choose from', silent: 'decorative' },
});
