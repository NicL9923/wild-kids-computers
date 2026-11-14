import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('mazes', {
  title: { text: 'Mazes' },
  goal: { text: 'Finds the way through a maze by looking ahead along the paths.', silent: 'parent' },
  instruction: {
    text: 'Help the animal find the way to its snack. Move the pointer along the path, or press the arrow keys.',
  },
  thisWay: { text: 'Try this way.' },
  maze: { text: 'The maze', silent: 'decorative' },
});
