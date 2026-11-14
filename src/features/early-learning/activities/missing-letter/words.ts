import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Pictured words with one letter to fill in, spelled the way they sound: short vowels, no silent
 * letters, no soft c or g, no vowel pairs. Every word is its emoji's spoken name.
 */
export const SHORT_WORDS = [
  'cat',
  'dog',
  'pig',
  'bed',
  'bus',
  'sun',
  'fox',
  'bat',
  'box',
  'map',
  'van',
  'log',
] as const satisfies readonly EmojiId[];

export const FOUR_LETTER_WORDS = [
  'frog',
  'crab',
  'drum',
  'milk',
  'nest',
  'tent',
  'hand',
  'sled',
  'fish',
  'duck',
  'ship',
  'bell',
  'lock',
] as const satisfies readonly EmojiId[];

export const LONG_WORDS = [
  'shell',
  'truck',
  'socks',
  'chick',
  'sloth',
  'lemon',
  'camel',
  'panda',
  'salad',
  'rabbit',
  'magnet',
  'basket',
] as const satisfies readonly EmojiId[];

export type MissingLetterWord =
  | (typeof SHORT_WORDS)[number]
  | (typeof FOUR_LETTER_WORDS)[number]
  | (typeof LONG_WORDS)[number];
