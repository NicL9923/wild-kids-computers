import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('rhyming-pairs', {
  title: { text: 'Rhyming pairs' },
  goal: { text: 'Hears which words rhyme and matches the pictures that do.', silent: 'parent' },
  instruction: { text: 'Find two pictures that rhyme. Rhymes sound the same at the end.' },
  cards: { text: 'Pictures to match', silent: 'decorative' },
});
