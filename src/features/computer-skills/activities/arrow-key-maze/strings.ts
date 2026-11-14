import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('arrow-key-maze', {
  title: { text: 'Arrow key maze' },
  goal: { text: 'Uses the arrow keys to move up, down, left, and right.', silent: 'parent' },
  instruction: { text: 'Press the arrow keys to take the animal to its snack.' },
  arrowKeys: { text: 'Use the arrow keys. They have little arrows on them.' },
  thisWay: { text: 'Try this arrow.' },
  arrows: { text: 'The arrow keys', silent: 'decorative' },
});
