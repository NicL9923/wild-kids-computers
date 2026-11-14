import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('picture-sudoku', {
  title: { text: 'Picture sudoku' },
  goal: { text: 'Uses what is already there to work out what goes in each empty square.', silent: 'parent' },
  instruction: {
    text: 'Each animal goes once in every row and once in every column. Click an empty square, then click the animal for it.',
  },
  boxes: {
    text: 'Each animal goes once in every row, every column, and every box of four. Click an empty square, then click the animal for it.',
  },
  grid: { text: 'The grid', silent: 'decorative' },
  empty: { text: 'Empty square', silent: 'decorative' },
  animals: { text: 'Animals', silent: 'decorative' },
});
