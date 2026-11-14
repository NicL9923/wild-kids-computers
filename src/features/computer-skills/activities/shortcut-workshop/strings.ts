import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('shortcut-workshop', {
  title: { text: 'Shortcut workshop' },
  goal: {
    text: 'Uses the keyboard shortcuts for select all, copy, cut, paste, undo, and save.',
    silent: 'parent',
  },
  instruction: { text: 'Use the keyboard shortcuts to change the note.' },
  // What each step asks.
  stepSelectAll: { text: 'Select all the text in the note.' },
  stepCopy: { text: 'Copy the word that is selected.' },
  stepPaste: { text: 'Paste the word on the empty line at the end.' },
  stepCut: { text: 'Cut out the line that does not belong.' },
  stepUndo: { text: 'A word went missing. Undo brings it back.' },
  stepSave: { text: 'Save the note.' },
  stepCopyPaste: { text: 'Copy the word, then paste it at the end of the last line.' },
  stepCutPaste: {
    text: 'Move the selected line to the top. Cut it, put the cursor at the very start, and paste.',
  },
  stepUndoTwice: { text: 'Two words went missing. Undo two times.' },
  stepTogether: {
    text: 'Select the first line and copy it. Paste it on the empty line at the end, then save.',
  },
  // How to press each shortcut, on Windows and Linux, and on a Mac.
  selectAllCtrl: { text: 'Hold Ctrl and press A.', speech: 'Hold Control and press A.' },
  selectAllCmd: { text: 'Hold Command and press A.' },
  copyCtrl: { text: 'Hold Ctrl and press C.', speech: 'Hold Control and press C.' },
  copyCmd: { text: 'Hold Command and press C.' },
  cutCtrl: { text: 'Hold Ctrl and press X.', speech: 'Hold Control and press X.' },
  cutCmd: { text: 'Hold Command and press X.' },
  pasteCtrl: { text: 'Hold Ctrl and press V.', speech: 'Hold Control and press V.' },
  pasteCmd: { text: 'Hold Command and press V.' },
  undoCtrl: { text: 'Hold Ctrl and press Z.', speech: 'Hold Control and press Z.' },
  undoCmd: { text: 'Hold Command and press Z.' },
  saveCtrl: { text: 'Hold Ctrl and press S.', speech: 'Hold Control and press S.' },
  saveCmd: { text: 'Hold Command and press S.' },
  // The editor.
  noteTitle: { text: 'My note', silent: 'decorative' },
  note: { text: 'The note', silent: 'decorative' },
  saved: { text: 'Saved', silent: 'decorative' },
  notSaved: { text: 'Not saved', silent: 'decorative' },
  startOver: { text: 'Start this step again' },
  shortcuts: { text: 'Shortcuts', silent: 'decorative' },
  nameSelectAll: { text: 'Select all', silent: 'decorative' },
  nameCopy: { text: 'Copy', silent: 'decorative' },
  nameCut: { text: 'Cut', silent: 'decorative' },
  namePaste: { text: 'Paste', silent: 'decorative' },
  nameUndo: { text: 'Undo', silent: 'decorative' },
  nameSave: { text: 'Save', silent: 'decorative' },
  capCtrl: { text: 'Ctrl', silent: 'decorative' },
  capCmd: { text: '⌘ Command', silent: 'decorative' },
  plusMark: { text: '+', silent: 'decorative' },
});
