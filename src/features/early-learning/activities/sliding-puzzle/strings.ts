import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('sliding-puzzle', {
  title: { text: 'Sliding puzzle' },
  goal: { text: 'Plans moves ahead to slide tiles back into a picture.', silent: 'parent' },
  instruction: { text: 'Click a tile next to the empty space to slide it. Make the picture whole again.' },
  canMove: { text: 'These tiles can slide.' },
  board: { text: 'The puzzle', silent: 'decorative' },
  tile: { text: 'Tile', silent: 'decorative' },
  picture: { text: 'The finished picture', silent: 'decorative' },
});
