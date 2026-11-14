import { defineStrings } from '../../core/strings/defineStrings.ts';

/** Controls the shell screens share, and the screen for a place that is not built yet. */
export const strings = defineStrings('shell', {
  replay: { text: 'Hear it again' },
  mute: { text: 'Mute' },
  grownUps: { text: 'Grown-ups', silent: 'parent' },
  notFound: { text: 'This place is not ready yet.' },
  backToMeadow: { text: 'Back to the meadow' },
});
