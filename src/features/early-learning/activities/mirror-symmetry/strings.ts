import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('mirror-symmetry', {
  title: { text: 'Mirror symmetry' },
  goal: { text: 'Completes a picture so that one half is the mirror image of the other.', silent: 'parent' },
  instruction: { text: 'Fill in squares so this side is a mirror of the other side.' },
  picture: { text: 'Mirror picture', silent: 'decorative' },
  row: { text: 'Row', silent: 'decorative' },
  column: { text: 'column', silent: 'decorative' },
});
