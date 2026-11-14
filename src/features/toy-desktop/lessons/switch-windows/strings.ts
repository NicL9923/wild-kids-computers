import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('switch-windows', {
  title: { text: 'Switch windows' },
  goal: {
    text: 'Brings a hidden window to the front, and makes a window fill the screen or go down to the task strip.',
    silent: 'parent',
  },
  instruction: { text: 'Find the window you hear, and bring it to the front.' },
  findNotepad: { text: 'Find the notepad window. Bring it to the front.' },
  findPictureViewer: { text: 'Find the picture window. Bring it to the front.' },
  findFileExplorer: { text: 'Find the folder window. Bring it to the front.' },
  findMusicBox: { text: 'Find the music box window. Bring it to the front.' },
  findCalculator: { text: 'Find the calculator window. Bring it to the front.' },
  maximize: { text: 'Now make it fill the screen. Click the square button.' },
  minimize: { text: 'Now put it away in the strip at the bottom. Click the line button.' },
  lookAtStrip: { text: 'Look at the strip at the bottom. Each window has a button there.' },
});
