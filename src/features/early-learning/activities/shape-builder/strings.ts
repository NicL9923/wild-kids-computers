import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('shape-builder', {
  title: { text: 'Shape builder' },
  goal: { text: 'Builds a picture from shapes by matching each shape to its outline.', silent: 'parent' },
  instruction: { text: 'Put each shape on its outline to finish the picture.' },
  robot: { text: 'robot' },
  picture: { text: 'The picture', silent: 'decorative' },
  tray: { text: 'Shapes to place', silent: 'decorative' },
});
