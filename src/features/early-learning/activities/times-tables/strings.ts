import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('times-tables', {
  title: { text: 'Times tables' },
  goal: {
    text: 'Answers multiplication facts, first by counting rows of things, then from the numbers.',
    silent: 'parent',
  },
  instruction: { text: 'How many are there in all? Click the number.' },
  rowsOf: { text: 'rows of' },
  howMany: { text: 'How many in all?' },
  whatIs: { text: 'What is' },
});
