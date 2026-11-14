import { defineStrings } from '../../../core/strings/defineStrings.ts';

/**
 * The spoken name of every paint effect, keyed by effect id, and of each effect group. Short words
 * a child knows. A registry test fails when an effect has no name here.
 */
export const strings = defineStrings('paint-effects', {
  // Groups
  'group-distort': { text: 'Push and pull' },
  'group-color': { text: 'Change the colors' },
  'group-paint-on': { text: 'Sprinkle on' },
  'group-whole-picture': { text: 'Whole picture' },
  // Distort
  swirl: { text: 'Swirl' },
  fingerPaint: { text: 'Finger paint' },
  tug: { text: 'Pull' },
  puff: { text: 'Puff up' },
  squeeze: { text: 'Squeeze' },
  pondRings: { text: 'Ripples' },
  soften: { text: 'Fuzzy' },
  chunky: { text: 'Blocks' },
  melt: { text: 'Melt' },
  jiggle: { text: 'Wiggle' },
  // Color
  hueShift: { text: 'Color swap' },
  sunny: { text: 'Lighter' },
  shady: { text: 'Darker' },
  grayWash: { text: 'Gray' },
  oldPhoto: { text: 'Old photo' },
  opposites: { text: 'Opposites' },
  vivid: { text: 'Brighter colors' },
  colorGlass: { text: 'Color glass' },
  fewColors: { text: 'Bold colors' },
  rainbowMap: { text: 'Rainbow' },
  // Paint on
  confetti: { text: 'Confetti' },
  sparkleDust: { text: 'Glitter' },
  soapBubbles: { text: 'Bubbles' },
  dewDrops: { text: 'Water drops' },
  iceCrystals: { text: 'Snowflakes' },
  grassTufts: { text: 'Grass' },
  petalShower: { text: 'Petals' },
  autumnLeaves: { text: 'Leaves' },
  honeycomb: { text: 'Honeycomb' },
  fireflyGlow: { text: 'Fireflies' },
  // Whole picture
  mirror: { text: 'Mirror' },
  flipSideways: { text: 'Flip' },
  flipUpsideDown: { text: 'Upside down' },
  fourCorners: { text: 'Four corners' },
  wobbleWater: { text: 'Wobbly water' },
  bulge: { text: 'Big middle' },
  mirrorWheel: { text: 'Kaleidoscope' },
  pictureGrid: { text: 'Picture grid' },
  bigPixels: { text: 'Big squares' },
  outlineSketch: { text: 'Pencil sketch' },
});
