import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('open-and-close', {
  title: { text: 'Open and close' },
  goal: { text: 'Opens an app with one click and closes its window with the close button.', silent: 'parent' },
  instruction: { text: 'Open an app, then close its window.' },
  openNotepad: { text: 'Click the notepad to open it.' },
  openPictureViewer: { text: 'Click the picture to open it.' },
  openFileExplorer: { text: 'Click the folder to open it.' },
  openMusicBox: { text: 'Click the music box to open it.' },
  openCalculator: { text: 'Click the calculator to open it.' },
  close: { text: 'Now close the window. Click the X.' },
});
