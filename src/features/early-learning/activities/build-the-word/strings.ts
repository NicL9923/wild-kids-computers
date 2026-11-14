import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('build-the-word', {
  title: { text: 'Build the word' },
  goal: { text: 'Spells a short word by putting its letters in order.', silent: 'parent' },
  instruction: { text: 'Build the word. Put each letter in its box.' },
  boxes: { text: 'Boxes for the letters', silent: 'decorative' },
  tiles: { text: 'Letters to use', silent: 'decorative' },
});
