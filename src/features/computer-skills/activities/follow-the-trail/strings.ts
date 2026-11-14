import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('follow-the-trail', {
  title: { text: 'Follow the trail' },
  goal: { text: 'Keeps the pointer on a path from start to end.', silent: 'parent' },
  instruction: { text: 'Help the bug get to its flower. Move along the path.' },
  findTheBug: { text: 'Find the bug, and move along the path from there.' },
});
