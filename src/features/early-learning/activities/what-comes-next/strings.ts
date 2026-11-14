import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('what-comes-next', {
  title: { text: 'What comes next' },
  goal: { text: 'Sees a pattern that repeats and tells what comes next.', silent: 'parent' },
  instruction: { text: 'The pictures make a pattern. What comes next? Click it.' },
  pattern: { text: 'The pattern', silent: 'decorative' },
  next: { text: 'The empty box', silent: 'decorative' },
  choices: { text: 'What can come next', silent: 'decorative' },
});
