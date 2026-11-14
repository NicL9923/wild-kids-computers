import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('alphabet-order', {
  title: { text: 'Alphabet order' },
  goal: {
    text: 'Knows the order of the alphabet: which letter comes next, and how to put letters in order.',
    silent: 'parent',
  },
  whatComesNext: { text: 'Which letter comes next?' },
  putInOrder: { text: 'Click the letters in ABC order.', speech: 'Click the letters in A, B, C order.' },
  sequence: { text: 'Letters in order', silent: 'decorative' },
  letters: { text: 'Letters to choose from', silent: 'decorative' },
});
