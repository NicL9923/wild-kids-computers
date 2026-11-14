import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('more-or-fewer', {
  title: { text: 'More or fewer' },
  goal: { text: 'Compares two or three groups and finds the one with more or fewer.', silent: 'parent' },
  more: { text: 'Which group has more? Click it.' },
  fewer: { text: 'Which group has fewer? Click it.' },
  most: { text: 'Which group has the most? Click it.' },
  fewest: { text: 'Which group has the fewest? Click it.' },
});
