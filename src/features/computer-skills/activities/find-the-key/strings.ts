import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('find-the-key', {
  title: { text: 'Find the key' },
  goal: { text: 'Finds a letter on the keyboard and presses it.', silent: 'parent' },
  instruction: { text: 'Find this letter on the keyboard and press it.' },
  press: { text: 'Press the letter' },
});
