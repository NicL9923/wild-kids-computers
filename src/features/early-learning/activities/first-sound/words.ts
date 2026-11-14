import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Pictures whose names start with one clear, regular sound: a single consonant that says its
 * usual sound, or a short vowel. No digraphs (sh, ch, th), no soft c or g (giraffe), no silent
 * letters (knife), and no picture a child might call something else that starts with another
 * letter (a cap that reads as a hat). Every word is its emoji's spoken name.
 */
export const WORDS = [
  // m
  'mouse',
  'moon',
  'milk',
  'map',
  'monkey',
  'mushroom',
  // s
  'sun',
  'socks',
  'seal',
  'soap',
  'sandwich',
  // f
  'fish',
  'fox',
  'fire',
  'foot',
  'feather',
  // l
  'lion',
  'leaf',
  'lemon',
  'lock',
  'ladder',
  'lollipop',
  // n
  'nest',
  'nose',
  'noodles',
  // r
  'rabbit',
  'rose',
  'rocket',
  'radio',
  // short vowels
  'apple',
  'ant',
  'astronaut',
  'egg',
  'elephant',
  'octopus',
  'umbrella',
  // b
  'bus',
  'bed',
  'bear',
  'bee',
  'banana',
  'bat',
  'boot',
  'bell',
  'book',
  'bike',
  'bone',
  'butterfly',
  'basket',
  // d
  'dog',
  'duck',
  'door',
  'deer',
  'dolphin',
  'doughnut',
  'dice',
  // hard g
  'goat',
  'goose',
  'guitar',
  'gorilla',
  // h
  'horse',
  'house',
  'hamburger',
  'hand',
  'heart',
  'hippo',
  'honey',
  'hedgehog',
  // k
  'key',
  'kite',
  'kangaroo',
  'koala',
  'kiwi',
  // hard c
  'cat',
  'car',
  'cow',
  'carrot',
  'camel',
  'corn',
  'candle',
  'canoe',
  'coat',
  'cookie',
  'cactus',
  // j
  'jellyfish',
  // p
  'pig',
  'pear',
  'pizza',
  'pencil',
  'penguin',
  'panda',
  'peach',
  'pie',
  'pineapple',
  // t
  'tiger',
  'tent',
  'turtle',
  'tooth',
  'tomato',
  'taco',
  // v
  'van',
  'violin',
  'volcano',
  // w
  'whale',
  'worm',
  'wolf',
  'watch',
  'window',
  'watermelon',
  // y, z
  'yo-yo',
  'zebra',
] as const satisfies readonly EmojiId[];

export type FirstSoundWord = (typeof WORDS)[number];
