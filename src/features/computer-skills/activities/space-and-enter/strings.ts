import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('space-and-enter', {
  title: { text: 'Space and Enter' },
  goal: { text: 'Presses Space to jump and Enter to open, and tells the two keys apart.', silent: 'parent' },
  instruction: { text: 'Help the animal get home. Press Space to jump. Press Enter to open doors.' },
  pressSpace: { text: 'Press Space to jump.' },
  pressEnterGate: { text: 'Press Enter to open the gate.' },
  pressEnterHome: { text: 'Press Enter to open the door.' },
  spaceIsLong: { text: 'Space is the long key at the bottom.' },
  enterIsBig: { text: 'Enter is the big key on the right side.' },
  gate: { text: 'Gate', silent: 'decorative' },
  home: { text: 'Home', silent: 'decorative' },
  path: { text: 'The path home', silent: 'decorative' },
});
