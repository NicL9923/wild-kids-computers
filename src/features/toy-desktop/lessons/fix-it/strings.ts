import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('fix-it', {
  title: { text: 'Fix it' },
  goal: {
    text: 'Solves simple computer problems: sound turned off, a window minimized, hidden behind another, or pushed off the screen.',
    silent: 'parent',
  },
  instruction: { text: 'Something is not right on this computer. Fix it.' },
  soundOff: { text: 'The sound is off. Turn it back on.' },
  minimized: { text: 'A window is hiding in the strip at the bottom. Bring it back.' },
  behind: { text: 'A window is hiding behind another one. Bring it to the front.' },
  offSide: { text: 'A window slid off the edge of the screen. Move it back.' },
});
