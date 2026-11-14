import { defineStrings } from '../../../../core/strings/defineStrings.ts';

/**
 * The reasons are said after the child finds the odd picture, so every round ends with the words
 * for why. Keys match the group ids in level.ts; the level test checks that every group that can
 * fill a round has one.
 */
export const strings = defineStrings('odd-one-out', {
  title: { text: 'Odd one out' },
  goal: { text: 'Sorts pictures into groups and finds the one that does not belong.', silent: 'parent' },
  instruction: { text: 'One picture does not go with the others. Click it.' },
  pictures: { text: 'Pictures', silent: 'decorative' },
  fruit: { text: 'The others are all fruit.' },
  vegetables: { text: 'The others are all vegetables.' },
  sweets: { text: 'The others are all sweet treats.' },
  farm: { text: 'The others all live on a farm.' },
  sea: { text: 'The others all live in the sea.' },
  birds: { text: 'The others are all birds.' },
  bugs: { text: 'The others are all bugs.' },
  road: { text: 'The others all drive on the road.' },
  clothes: { text: 'The others are all clothes.' },
  instruments: { text: 'The others all make music.' },
  balls: { text: 'The others are all balls.' },
  sky: { text: 'The others are all in the sky.' },
});
