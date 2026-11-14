import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('memory-pairs', {
  title: { text: 'Memory pairs' },
  goal: { text: 'Remembers where pictures are hidden to find the ones that match.', silent: 'parent' },
  instruction: { text: 'Turn over two cards. Find two pictures that are the same.' },
  cards: { text: 'Cards', silent: 'decorative' },
  card: { text: 'Card', silent: 'decorative' },
});
