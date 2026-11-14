import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('number-line', {
  title: { text: 'Number line' },
  goal: { text: 'Finds where a number goes on a number line, and the number that is missing.', silent: 'parent' },
  missing: { text: 'Which number is missing? Click it.' },
  placeFor: { text: 'Click the place on the line for' },
  // For screen readers: a place counted from a written number, never its own number, the answer.
  markAfter: { text: 'mark after', silent: 'decorative' },
  marksAfter: { text: 'marks after', silent: 'decorative' },
  markBefore: { text: 'mark before', silent: 'decorative' },
  marksBefore: { text: 'marks before', silent: 'decorative' },
});
