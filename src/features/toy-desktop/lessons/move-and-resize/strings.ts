import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('move-and-resize', {
  title: { text: 'Move and resize' },
  goal: {
    text: 'Moves a window by its title bar and changes its size by its corner, to fit a marked place.',
    silent: 'parent',
  },
  instruction: { text: 'Move the window into the dashed box. Pick it up by its title bar.' },
  resize: { text: 'Now make it fit the new box. Pull the corner at the bottom right.' },
  moveCloser: { text: 'Line the window up with the dashed box.' },
  resizeCloser: { text: 'Pull the corner until the window fills the box.' },
});
