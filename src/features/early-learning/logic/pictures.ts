import type { EmojiId } from '../../../core/strings/shared/emoji.ts';

/**
 * Picture sets the memory and logic activities draw from. Each set holds pictures a young child
 * names at a glance and tells apart by shape, not by color alone. Look-alikes stay out of every
 * set: one apple, one tree, one car, one fish. A test checks that no set repeats a picture and
 * that no picture is in two sets.
 */
export const PICTURE_SETS = {
  animals: [
    'dog',
    'cat',
    'rabbit',
    'bear',
    'lion',
    'cow',
    'pig',
    'horse',
    'elephant',
    'giraffe',
    'monkey',
    'frog',
    'turtle',
    'penguin',
    'owl',
    'duck',
    'snail',
    'butterfly',
    'octopus',
    'whale',
  ],
  food: [
    'apple',
    'banana',
    'grapes',
    'strawberry',
    'cherries',
    'watermelon',
    'pear',
    'pineapple',
    'carrot',
    'corn',
    'broccoli',
    'cheese',
    'egg',
    'bread',
    'pizza',
    'ice-cream',
    'cupcake',
    'cookie',
    'lollipop',
    'doughnut',
  ],
  things: [
    'car',
    'bus',
    'airplane',
    'rocket',
    'sailboat',
    'bike',
    'tractor',
    'balloon',
    'kite',
    'teddy-bear',
    'umbrella',
    'key',
    'bell',
    'house',
    'guitar',
    'drum',
    'soccer-ball',
    'crayon',
    'book',
    'sun',
  ],
} as const satisfies Readonly<Record<string, readonly EmojiId[]>>;

export type PictureSetId = keyof typeof PICTURE_SETS;

export type Picture = (typeof PICTURE_SETS)[PictureSetId][number];

export const PICTURE_SET_IDS = ['animals', 'food', 'things'] as const satisfies readonly PictureSetId[];

/** Every picture in every set, in set order. */
export const ALL_PICTURES: readonly Picture[] = PICTURE_SET_IDS.flatMap((id) => PICTURE_SETS[id]);
