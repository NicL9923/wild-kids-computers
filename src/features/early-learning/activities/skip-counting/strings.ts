import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('skip-counting', {
  title: { text: 'Skip counting' },
  goal: { text: 'Continues a count by twos, fives, or tens.', silent: 'parent' },
  byTwos: { text: 'Count by twos.' },
  byFives: { text: 'Count by fives.' },
  byTens: { text: 'Count by tens.' },
  whatNext: { text: 'What number comes next? Click it.' },
  whichMissing: { text: 'Which number is missing? Click it.' },
  count: { text: 'The count', silent: 'decorative' },
});
