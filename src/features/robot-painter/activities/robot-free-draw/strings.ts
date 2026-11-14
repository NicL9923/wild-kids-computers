import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('robot-free-draw', {
  title: { text: 'Robot drawing' },
  goal: {
    text: 'Plays freely with the robot blocks and sees what each program draws. There is nothing to solve.',
    silent: 'parent',
  },
  instruction: { text: 'Make the robot draw anything you like.' },
});
