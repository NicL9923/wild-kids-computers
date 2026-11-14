import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('shape-sorter', {
  title: { text: 'Shape sorter' },
  goal: { text: 'Tells shapes apart by putting each one in the hole it fits.', silent: 'parent' },
  instruction: { text: 'Put each shape in the hole it fits.' },
  shapes: { text: 'Shapes', silent: 'decorative' },
  holes: { text: 'Holes', silent: 'decorative' },
});
