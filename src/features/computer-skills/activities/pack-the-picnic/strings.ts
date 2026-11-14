import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('pack-the-picnic', {
  title: { text: 'Pack the picnic' },
  goal: { text: 'Moves things to a place by dragging, or by click and click.', silent: 'parent' },
  instruction: { text: 'Put the food in the basket.' },
  spots: { text: 'Put each food on its shadow on the blanket.' },
});
