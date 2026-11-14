import { defineStrings } from '../../core/strings/defineStrings.ts';

/** The start screen's own words. First launch and the profile choice have their own. */
export const strings = defineStrings('start', {
  unavailable: { text: 'Your saved things did not open yet. Try again, or get a grown-up.' },
});
