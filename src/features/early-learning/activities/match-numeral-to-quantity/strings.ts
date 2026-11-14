import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('match-numeral-to-quantity', {
  title: { text: 'Match the number' },
  goal: { text: 'Matches a written number to a group with that many things.', silent: 'parent' },
  instruction: { text: 'Find the group with this many.' },
  find: { text: 'Find the group with' },
});
