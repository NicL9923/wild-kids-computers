import { defineStrings } from '../../core/strings/defineStrings.ts';

/**
 * Names of the avatars, profile colors, and age bands. First launch speaks them, so they are
 * spoken strings; the parent corner shows the same words. Keys end in the item's id, so a lookup
 * by id fails to compile when an id has no name.
 */
export const strings = defineStrings('profiles', {
  'avatar-fox': { text: 'Fox' },
  'avatar-rabbit': { text: 'Rabbit' },
  'avatar-owl': { text: 'Owl' },
  'avatar-hedgehog': { text: 'Hedgehog' },
  'avatar-frog': { text: 'Frog' },
  'avatar-bear': { text: 'Bear' },
  'avatar-turtle': { text: 'Turtle' },
  'avatar-snail': { text: 'Snail' },
  'avatar-duck': { text: 'Duck' },
  'avatar-deer': { text: 'Deer' },
  'avatar-squirrel': { text: 'Squirrel' },
  'avatar-bee': { text: 'Bee' },
  'color-sun': { text: 'Sunny yellow' },
  'color-marigold': { text: 'Marigold orange' },
  'color-poppy': { text: 'Poppy red' },
  'color-sky': { text: 'Sky blue' },
  'color-lake': { text: 'Lake blue' },
  'color-fern': { text: 'Fern green' },
  'color-clover': { text: 'Clover pink' },
  'color-night': { text: 'Night gray' },
  'band-band-3-5': { text: 'Ages 3 to 5' },
  'about-band-3-5': { text: 'Big pictures, and everything is spoken. No reading needed.' },
  'band-band-6-8': { text: 'Ages 6 to 8' },
  'about-band-6-8': { text: 'Short words with speech, and more tools.' },
  'band-band-9-12': { text: 'Ages 9 to 12' },
  'about-band-9-12': { text: 'A plainer look, every tool, and written instructions.' },
});
