import { defineStrings } from '../defineStrings.ts';

/**
 * Short feedback lines every activity shares. They describe what happened and what to do next.
 * They never scold, never show disappointment, and never over-praise: a calm "You did it" says
 * the task is done without judging the child.
 */
export const strings = defineStrings('feedback', {
  // After a correct action.
  yes: { text: 'Yes.' },
  thatsIt: { text: "That's it." },
  youFoundIt: { text: 'You found it.' },
  thereItGoes: { text: 'There it goes.' },
  // After a wrong action. Neutral, and always points to the next try.
  goesSomewhereElse: { text: 'That one goes somewhere else.' },
  tryAnother: { text: 'Try another one.' },
  lookAgain: { text: 'Look again.' },
  notThatOne: { text: 'Not that one. Try again.' },
  // A hint, offered after a pause or a few tries.
  hereItIs: { text: 'Here it is.' },
  listenAgain: { text: 'Listen again.' },
  // The end of a task or a round.
  youDidIt: { text: 'You did it.' },
  allDone: { text: 'All done.' },
});
