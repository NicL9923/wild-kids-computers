import { defineStrings } from '../defineStrings.ts';

/** Basic shape names. The star here is the shape, never a reward, so it allows the "star" rule. */
export const strings = defineStrings('shapes', {
  circle: { text: 'circle' },
  square: { text: 'square' },
  triangle: { text: 'triangle' },
  rectangle: { text: 'rectangle' },
  oval: { text: 'oval' },
  diamond: { text: 'diamond' },
  heart: { text: 'heart' },
  star: { text: 'star', allow: ['star'] },
  hexagon: { text: 'hexagon' },
});
