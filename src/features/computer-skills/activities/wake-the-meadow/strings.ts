import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('wake-the-meadow', {
  title: { text: 'Wake the meadow' },
  goal: { text: 'Moves the pointer and sees the screen answer at once.', silent: 'parent' },
  instruction: { text: 'Move over the grass to wake up the flowers.' },
});
