import { defineStrings } from '../../core/strings/defineStrings.ts';

/** The calm screen after the session length is used up. No clock, no count, no blame. */
export const strings = defineStrings('closing', {
  heading: { text: 'Time for something else now.' },
  choicesTitle: { text: 'What next?', silent: 'parent' },
  choicesAbout: { text: 'Give the child a little more time, or close the app.', silent: 'parent' },
  moreTime: { text: 'Ten more minutes', silent: 'parent' },
  closeApp: { text: 'Close the app', silent: 'parent' },
  close: { text: 'Close', silent: 'parent' },
});
