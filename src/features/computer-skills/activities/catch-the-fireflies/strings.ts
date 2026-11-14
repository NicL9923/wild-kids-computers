import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('catch-the-fireflies', {
  title: { text: 'Catch the fireflies' },
  goal: { text: 'Clicks a target that moves.', silent: 'parent' },
  instruction: { text: 'Click a firefly to catch it.' },
  firefly: { text: 'Firefly' },
});
