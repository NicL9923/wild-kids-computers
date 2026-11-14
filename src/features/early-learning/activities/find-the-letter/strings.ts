import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('find-the-letter', {
  title: { text: 'Find the letter' },
  goal: { text: 'Hears the name of a letter and finds that letter among others.', silent: 'parent' },
  instruction: { text: 'Find this letter.' },
  hearAgain: { text: 'Hear the letter again', silent: 'decorative' },
  letters: { text: 'Letters to choose from', silent: 'decorative' },
});
