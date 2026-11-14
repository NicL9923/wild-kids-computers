import type { SpokenHandle } from '../../../core/strings/defineStrings.ts';
import { strings as letterNames } from '../../../core/strings/shared/letterNames.ts';
import { strings as letterSounds } from '../../../core/strings/shared/letterSounds.ts';

/**
 * The alphabet and what young readers mix up in it, for the letters and reading activities.
 * Pure data and lookups: level generators import it, so it imports no React.
 */

export const ALPHABET = [
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
  'q',
  'r',
  's',
  't',
  'u',
  'v',
  'w',
  'x',
  'y',
  'z',
] as const;

export type Letter = (typeof ALPHABET)[number];

export function isLetter(value: string): value is Letter {
  return (ALPHABET as readonly string[]).includes(value);
}

/** The letters of a lowercase word. Throws on anything else, so a typo in a word list fails loudly. */
export function lettersOf(word: string): Letter[] {
  // Word lists hold plain lowercase ASCII, so splitting by code unit is exact.
  return word.split('').map((character) => {
    if (!isLetter(character)) throw new RangeError(`"${word}" has "${character}", which is not a lowercase letter.`);
    return character;
  });
}

/** The letter's name, "bee". */
export function letterName(letter: Letter): SpokenHandle {
  return letterNames[letter];
}

/** The letter's sound, "buh". */
export function letterSound(letter: Letter): SpokenHandle {
  return letterSounds[letter];
}

/**
 * Letters that make the same first sound in the shared clips: c and k both say "kuh", and q
 * says "kwuh". Two of them in one round would give two right answers to a sound.
 */
const SAME_SOUND: readonly (readonly Letter[])[] = [['c', 'k', 'q']];

/**
 * Letter sounds a young ear mixes up: voiced and voiceless pairs, the two nasals, and the short
 * vowels that sit close together.
 */
const SIMILAR_SOUND: readonly (readonly Letter[])[] = [
  ['b', 'p'],
  ['d', 't'],
  ['f', 'v'],
  ['m', 'n'],
  ['s', 'z'],
  ['g', 'k', 'c'],
  ['e', 'i'],
  ['o', 'u'],
];

/**
 * Lowercase letters with shapes young readers mix up: mirror and flip images, and letters that
 * differ by one stroke.
 */
const LOOK_ALIKE: readonly (readonly Letter[])[] = [
  ['b', 'd', 'p', 'q'],
  ['m', 'n'],
  ['n', 'u', 'h', 'r'],
  ['i', 'l', 'j'],
  ['v', 'w', 'y'],
  ['c', 'o', 'e'],
  ['f', 't'],
];

/**
 * Capital letters with shapes young readers mix up. Used only for capital rounds, where the
 * lowercase pairs above do not apply.
 */
const LOOK_ALIKE_CAPITAL: readonly (readonly Letter[])[] = [
  ['e', 'f'],
  ['o', 'q', 'c', 'g'],
  ['m', 'n', 'w'],
  ['p', 'r', 'b'],
  ['i', 'l', 't'],
  ['u', 'v'],
  ['d', 'o'],
];

function inOneGroup(groups: readonly (readonly Letter[])[], a: Letter, b: Letter): boolean {
  return a !== b && groups.some((group) => group.includes(a) && group.includes(b));
}

/** Two different letters that say the same sound in the shared clips. */
export function sameSound(a: Letter, b: Letter): boolean {
  return inOneGroup(SAME_SOUND, a, b);
}

/** Two different letters whose sounds are easy to mix up, or that say the same sound. */
export function similarSound(a: Letter, b: Letter): boolean {
  return inOneGroup(SIMILAR_SOUND, a, b) || sameSound(a, b);
}

/** Two different letters whose shapes are easy to mix up in the given case. */
export function lookAlike(a: Letter, b: Letter, letterCase: LetterCase = 'lower'): boolean {
  return inOneGroup(letterCase === 'lower' ? LOOK_ALIKE : LOOK_ALIKE_CAPITAL, a, b);
}

export type LetterCase = 'lower' | 'upper';

/** The letter as it is shown in a round of the given case. */
export function shown(letter: Letter, letterCase: LetterCase): string {
  return letterCase === 'upper' ? letter.toUpperCase() : letter;
}

export const VOWELS: readonly Letter[] = ['a', 'e', 'i', 'o', 'u'];
