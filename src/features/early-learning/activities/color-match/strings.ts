import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('color-match', {
  title: { text: 'Color match' },
  goal: { text: 'Matches things by color and hears the name of each color.', silent: 'parent' },
  instruction: { text: 'Put each toy in the box of the same color.' },
  toys: { text: 'Toys', silent: 'decorative' },
  boxes: { text: 'Color boxes', silent: 'decorative' },
  patterns: {
    text: 'Show a pattern for each color',
    silent: 'parent',
  },
});
