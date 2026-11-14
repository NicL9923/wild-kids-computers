import { defineStrings } from '../../../../core/strings/defineStrings.ts';

/** The namespace "letter-sounds" belongs to the shared letter sound clips. */
export const strings = defineStrings('letter-sounds-activity', {
  title: { text: 'Letter sounds' },
  goal: { text: 'Hears the sound a letter makes and picks that letter.', silent: 'parent' },
  instruction: { text: 'Which letter makes this sound?' },
  hearAgain: { text: 'Hear the sound again', silent: 'decorative' },
  letters: { text: 'Letters to choose from', silent: 'decorative' },
});
