import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('jigsaw', {
  title: { text: 'Jigsaw' },
  goal: { text: 'Puts a picture back together by matching the shapes and colors of its pieces.', silent: 'parent' },
  instruction: { text: 'Put the pieces back to make the picture. Drag a piece, or click it and then click its place.' },
  board: { text: 'The picture', silent: 'decorative' },
  tray: { text: 'Pieces', silent: 'decorative' },
  piece: { text: 'Piece', silent: 'decorative' },
});
