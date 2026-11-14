import { defineStrings } from '../../core/strings/defineStrings.ts';

/** First launch, for a parent and child together. Every step is spoken. */
export const strings = defineStrings('first-launch', {
  animalHeading: { text: 'Hello! Pick an animal for the player.' },
  animalLabel: { text: 'Animal' },
  colorHeading: { text: 'Now pick a color.' },
  colorLabel: { text: 'Color' },
  nameLabel: { text: 'Name, if you like' },
  nameHint: { text: 'A grown-up can type it. It can stay empty.' },
  bandHeading: { text: 'How old is the player?' },
  bandIntro: { text: 'This sets how big things are and how much reading there is. A grown-up can change it later.' },
  bandLabel: { text: 'Age band' },
  soundHeading: { text: 'Let us check the sound.' },
  playSound: { text: 'Play the sound' },
  testSentence: { text: 'Hello! Can you hear me?' },
  heardQuestion: { text: 'Did you hear it?' },
  heardYes: { text: 'Yes, I heard it' },
  heardNo: { text: 'No, play it again' },
  volumeHint: { text: 'Check that the volume is up and that the speakers or headphones are on.' },
  kioskHeading: { text: 'Keep the app on the whole screen?' },
  kioskLabel: { text: 'Kiosk lock' },
  kioskAbout: {
    text: 'Kiosk lock fills the screen and asks a grown-up before the app closes. It is best effort: the computer can still use its own shortcuts.',
  },
  pickAnimalFirst: { text: 'Pick an animal first.' },
  pickColorFirst: { text: 'Pick a color first.' },
  pickBandFirst: { text: 'Pick an age band first.' },
  back: { text: 'Back' },
  next: { text: 'Next' },
  finish: { text: 'Go to the meadow' },
});
