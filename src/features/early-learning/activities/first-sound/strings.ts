import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('first-sound', {
  title: { text: 'First sound' },
  goal: { text: 'Hears the first sound of a word and picks the letter for it.', silent: 'parent' },
  instruction: { text: 'Which letter does this word start with?' },
  letters: { text: 'Letters to choose from', silent: 'decorative' },
});
