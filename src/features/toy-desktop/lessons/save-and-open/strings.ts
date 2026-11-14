import { defineStrings } from '../../../../core/strings/defineStrings.ts';

export const strings = defineStrings('save-and-open', {
  title: { text: 'Save and open' },
  goal: {
    text: 'Saves work in the notepad with a name, closes it, and finds and opens it again.',
    silent: 'parent',
  },
  instruction: { text: 'Save your note, close it, then open it again.' },
  save: { text: 'Save your note. Click File, then Save.' },
  name: { text: 'Type a name for your note, then click Save.' },
  nameInNotes: { text: 'Click the Notes folder. Then type a name for your note, and click Save.' },
  close: { text: 'Now close the notepad. Click the X.' },
  reopen: { text: 'Open your note again. Click the notepad, then File, then Open.' },
});
