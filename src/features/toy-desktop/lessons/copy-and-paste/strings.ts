import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('copy-and-paste', {
  title: { text: 'Copy and paste' },
  goal: {
    text: 'Moves a number from one app to another with copy and paste, from the Edit menu and then with keyboard shortcuts.',
    silent: 'parent',
  },
  instruction: { text: 'Copy the number from one app and paste it into the other.' },
  // From the Edit menu.
  calculatorCopy: { text: 'Copy the answer. Click the calculator, then Edit, then Copy.' },
  notePaste: { text: 'Now paste it in the note. Click the note, then Edit, then Paste.' },
  noteSelect: { text: 'Copy the number in the note. First click the note, then Edit, then Select all.' },
  noteCopy: { text: 'Now click Edit, then Copy.' },
  calculatorPaste: { text: 'Now paste it in the calculator. Click the calculator, then Edit, then Paste.' },
  // With shortcuts, on Windows and Linux.
  calculatorCopyCtrl: {
    text: 'Copy the answer. Click the calculator, then hold Ctrl and press C.',
    speech: 'Copy the answer. Click the calculator, then hold Control and press C.',
  },
  notePasteCtrl: {
    text: 'Now paste it in the note. Click the note, then hold Ctrl and press V.',
    speech: 'Now paste it in the note. Click the note, then hold Control and press V.',
  },
  noteSelectCtrl: {
    text: 'Copy the number in the note. First click the note, then hold Ctrl and press A.',
    speech: 'Copy the number in the note. First click the note, then hold Control and press A.',
  },
  noteCopyCtrl: { text: 'Now hold Ctrl and press C.', speech: 'Now hold Control and press C.' },
  calculatorPasteCtrl: {
    text: 'Now paste it in the calculator. Click the calculator, then hold Ctrl and press V.',
    speech: 'Now paste it in the calculator. Click the calculator, then hold Control and press V.',
  },
  // With shortcuts, on a Mac.
  calculatorCopyCmd: { text: 'Copy the answer. Click the calculator, then hold Command and press C.' },
  notePasteCmd: { text: 'Now paste it in the note. Click the note, then hold Command and press V.' },
  noteSelectCmd: { text: 'Copy the number in the note. First click the note, then hold Command and press A.' },
  noteCopyCmd: { text: 'Now hold Command and press C.' },
  calculatorPasteCmd: { text: 'Now paste it in the calculator. Click the calculator, then hold Command and press V.' },
});
