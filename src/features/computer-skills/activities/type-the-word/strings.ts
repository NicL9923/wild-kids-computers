import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('type-the-word', {
  title: { text: 'Type the word' },
  goal: { text: 'Types a short word, one letter at a time.', silent: 'parent' },
  instruction: { text: 'Look at the picture and type its word.' },
  type: { text: 'Type the word' },
  word: { text: 'The word to type', silent: 'decorative' },
});
