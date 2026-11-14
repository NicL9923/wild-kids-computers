import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('robot-patterns', {
  title: { text: 'Robot patterns' },
  goal: {
    text: 'Builds longer programs with repeat, pen, and color blocks, and finds the block that does not fit.',
    silent: 'parent',
  },
  instruction: { text: 'Build a program to draw the picture. Then press go.' },
});
