import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('count-the-flowers', {
  title: { text: 'Count the flowers' },
  goal: { text: 'Counts objects and picks the number that matches.', silent: 'parent' },
  instruction: { text: 'How many flowers are there? Click the number.' },
  numbers: { text: 'Numbers to choose from', silent: 'decorative' },
});
