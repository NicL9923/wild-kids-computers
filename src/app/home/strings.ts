import { defineStrings } from '../../core/strings/defineStrings.ts';

/** The home map. Each place says its name when the pointer or the keyboard reaches it. */
export const strings = defineStrings('home', {
  title: { text: 'The meadow' },
  instruction: { text: 'Pick a place to play.' },
  'place-paint-studio': { text: 'Paint studio' },
  'place-early-learning': { text: 'Letters and numbers' },
  'place-toy-desktop': { text: 'Toy computer' },
  'place-computer-skills': { text: 'Computer skills' },
  'place-robot-painter': { text: 'Robot painter' },
  changePlayer: { text: 'Change player' },
});
