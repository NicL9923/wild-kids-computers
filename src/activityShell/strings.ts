import { defineStrings } from '../core/strings/defineStrings.ts';

/** The words of the frame every activity shares: its controls, the finish screen, and the area screen. */
export const strings = defineStrings('activity-shell', {
  replay: { text: 'Hear it again' },
  exitToArea: { text: 'Go back' },
  exitToMeadow: { text: 'Back to the meadow' },
  soundOff: { text: 'Sound off' },
  playAgain: { text: 'Play again' },
  goBack: { text: 'Go back to the games' },
  pickAGame: { text: 'Pick a game.' },
  pickAStep: { text: 'Pick one to play.' },
  nothingHereYet: { text: 'Nothing here yet. Go back to the meadow.' },
  loading: { text: 'Getting ready.', silent: 'decorative' },
  // Area names, spoken when an area screen opens.
  'computer-skills': { text: 'Computer skills' },
  'toy-desktop': { text: 'Toy desktop' },
  'early-learning': { text: 'Early learning' },
  'robot-painter': { text: 'Robot painter' },
});
