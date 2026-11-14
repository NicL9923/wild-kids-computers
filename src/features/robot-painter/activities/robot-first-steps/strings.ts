import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('robot-first-steps', {
  title: { text: 'Robot first steps' },
  goal: {
    text: 'Gives a robot steps with arrow blocks, first one at a time, then as a short plan run all at once.',
    silent: 'parent',
  },
  instruction: { text: 'Help the robot draw. Use the arrows.' },
});
