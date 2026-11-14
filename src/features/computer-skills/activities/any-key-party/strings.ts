import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('any-key-party', {
  title: { text: 'Any key party' },
  goal: { text: 'Presses keys on the keyboard and sees that each press does something.', silent: 'parent' },
  instruction: { text: 'Press any key on the keyboard. Every key brings a friend.' },
  useKeys: { text: 'Press a key on the keyboard.' },
});
