import { defineStrings } from '../defineStrings.ts';

/** Ordinal words for sequences and positions: first to tenth. */
export const strings = defineStrings('ordinals', {
  first: { text: 'first' },
  second: { text: 'second' },
  third: { text: 'third' },
  fourth: { text: 'fourth' },
  fifth: { text: 'fifth' },
  sixth: { text: 'sixth', speech: '/sɪksθː/' },
  seventh: { text: 'seventh' },
  eighth: { text: 'eighth' },
  ninth: { text: 'ninth' },
  tenth: { text: 'tenth' },
});
