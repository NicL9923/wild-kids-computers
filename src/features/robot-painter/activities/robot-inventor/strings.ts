import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('robot-inventor', {
  title: { text: 'Robot inventor' },
  goal: {
    text: 'Draws shapes with turns by angle, repeats inside repeats, and blocks the child defines.',
    silent: 'parent',
  },
  instruction: { text: 'Use forward, turn, and repeat to draw the shape. Then press go.' },
});
