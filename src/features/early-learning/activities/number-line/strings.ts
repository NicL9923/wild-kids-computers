import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('number-line', {
  title: { text: 'Number line' },
  goal: { text: 'Finds where a number goes on a number line, and the number that is missing.', silent: 'parent' },
  missing: { text: 'Which number is missing? Click it.' },
  placeFor: { text: 'Click the place on the line for' },
});
