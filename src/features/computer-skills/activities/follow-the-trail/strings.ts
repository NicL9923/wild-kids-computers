import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('follow-the-trail', {
  title: { text: 'Follow the trail' },
  goal: { text: 'Keeps the pointer on a path from start to end.', silent: 'parent' },
  instruction: { text: 'Help the bug get to its flower. Move along the path.' },
  comeBack: { text: 'Come back to the bug, and go along the path.' },
});
