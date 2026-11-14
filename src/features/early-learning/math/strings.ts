import { defineStrings } from '../../../core/strings/defineStrings.ts';

/**
 * Words the number and math activities share: the signs of a number sentence, and the names of
 * the choice rows. A sign shows its symbol and speaks its word, so "3 + 2" sounds like the
 * sentence a teacher would say.
 */
export const strings = defineStrings('early-math', {
  numbers: { text: 'Numbers to choose from', silent: 'decorative' },
  groups: { text: 'Groups to choose from', silent: 'decorative' },
  plus: { text: '+', speech: 'plus' },
  minus: { text: '−', speech: 'take away' },
  times: { text: '×', speech: 'times' },
  equals: { text: '=', speech: 'equals' },
  unknown: { text: '?', silent: 'decorative' },
  missing: { text: 'The missing number', silent: 'decorative' },
});
