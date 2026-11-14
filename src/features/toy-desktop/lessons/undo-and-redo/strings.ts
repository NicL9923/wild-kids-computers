import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('undo-and-redo', {
  title: { text: 'Undo and redo' },
  goal: {
    text: 'Takes back the last change with Undo and brings it back with Redo, in the notepad and the music box.',
    silent: 'parent',
  },
  instruction: { text: 'Take back the last change, then bring it back.' },
  // From the Edit menu.
  undoWord: { text: 'Take back the last word. Click Edit, then Undo.' },
  undoDot: { text: 'Take back the last dot in the music box. Click Edit, then Undo.' },
  undoDotNext: { text: 'Now click the music box. Take back its last dot: click Edit, then Undo.' },
  redo: { text: 'Now bring it back. Click Edit, then Redo.' },
  // With shortcuts, on Windows and Linux.
  undoWordCtrl: {
    text: 'Take back the last word. Hold Ctrl and press Z.',
    speech: 'Take back the last word. Hold Control and press Z.',
  },
  undoDotCtrl: {
    text: 'Take back the last dot in the music box. Hold Ctrl and press Z.',
    speech: 'Take back the last dot in the music box. Hold Control and press Z.',
  },
  undoDotNextCtrl: {
    text: 'Now click the music box. Take back its last dot: hold Ctrl and press Z.',
    speech: 'Now click the music box. Take back its last dot: hold Control and press Z.',
  },
  redoCtrl: {
    text: 'Now bring it back. Hold Ctrl and Shift, and press Z.',
    speech: 'Now bring it back. Hold Control and Shift, and press Z.',
  },
  // With shortcuts, on a Mac.
  undoWordCmd: { text: 'Take back the last word. Hold Command and press Z.' },
  undoDotCmd: { text: 'Take back the last dot in the music box. Hold Command and press Z.' },
  undoDotNextCmd: { text: 'Now click the music box. Take back its last dot: hold Command and press Z.' },
  redoCmd: { text: 'Now bring it back. Hold Command and Shift, and press Z.' },
});
