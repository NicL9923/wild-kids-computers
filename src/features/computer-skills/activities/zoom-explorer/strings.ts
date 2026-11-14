import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('zoom-explorer', {
  title: { text: 'Zoom explorer' },
  goal: { text: 'Zooms in to see small things up close, and zooms back out.', silent: 'parent' },
  instruction: { text: 'Zoom in close to find the tiny things, then click them.' },
  findTiny: { text: 'Zoom in and find every tiny' },
  tooSmall: { text: 'It is too small to catch. Zoom in closer with the plus button.' },
  zoomOut: { text: 'You found them all. Now zoom all the way out.' },
  zoomInButton: { text: 'Zoom in', silent: 'decorative' },
  zoomOutButton: { text: 'Zoom out', silent: 'decorative' },
  lookFor: { text: 'Look for', silent: 'decorative' },
  picture: { text: 'The big picture. Scroll to look around.', silent: 'decorative' },
});
