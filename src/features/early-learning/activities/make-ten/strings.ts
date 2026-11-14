import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('make-ten', {
  title: { text: 'Make ten' },
  goal: { text: 'Finds how many more make ten, using a ten frame.', silent: 'parent' },
  ten: { text: 'How many more make ten? Click the number.' },
  five: { text: 'How many more make five? Click the number.' },
  frame: { text: 'Ten frame', silent: 'decorative' },
  counter: { text: 'Counter', silent: 'decorative' },
  space: { text: 'Empty space', silent: 'decorative' },
  added: { text: 'Added counter', silent: 'decorative' },
});
