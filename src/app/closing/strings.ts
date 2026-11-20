import { defineStrings } from '../../core/strings/defineStrings.ts';

/** The calm screen after the session length is used up. No clock, no count, no blame. */
export const strings = defineStrings('closing', {
  heading: { text: 'Time for something else now.' },
  choicesTitle: { text: 'What next?', silent: 'parent' },
  choicesAbout: { text: 'Give the child more time, open the parent corner, or close the app.', silent: 'parent' },
  choicesAboutBrowser: { text: 'Give the child more time, or open the parent corner.', silent: 'parent' },
  moreTime: { text: 'Ten more minutes', silent: 'parent' },
  switchPlayer: { text: 'Switch player', silent: 'parent' },
  parentCorner: { text: 'Parent corner', silent: 'parent' },
  closeApp: { text: 'Close the app', silent: 'parent' },
  close: { text: 'Close', silent: 'parent' },
});
