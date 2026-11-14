import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Pictured words to build from letter tiles, each spelled the way it sounds: short vowels, no
 * silent e, no vowel pairs. The longer words add blends (fr, st) and the digraphs sh, ck, ch, and
 * th, which a child in band-6-8 is learning. Every word is its emoji's spoken name.
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
  'ant',
  'egg',
] as const satisfies readonly EmojiId[];

export const LONGER_WORDS = [
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
  'shell',
  'truck',
  'socks',
  'chick',
  'sloth',
  'shrimp',
] as const satisfies readonly EmojiId[];

export type BuildWord = (typeof SHORT_WORDS)[number] | (typeof LONGER_WORDS)[number];
