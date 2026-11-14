import type { ActivityStep } from '../../../../core/activityKit/defineActivity.ts';

/**
 * The typing course: twenty short lessons, written by hand. The home row comes first, then one or
 * two new keys a lesson, with a lesson of real words after every few new keys, then capitals and
 * whole sentences. Each line uses only keys taught so far; a unit test checks that.
 */

export interface Lesson extends ActivityStep {
  /** The keys this lesson brings in, characters or Shift, in the order they are named. Empty for practice. */
  readonly newKeys: readonly string[];
  /** The line to type. */
  readonly line: string;
}

export const SHIFT = 'Shift';

export const LESSONS: readonly Lesson[] = [
  { id: 'f-and-j', newKeys: ['f', 'j'], line: 'fff jjj ff jj fj jf fjf jfj' },
  { id: 'd-and-k', newKeys: ['d', 'k'], line: 'ddd kkk dk kd fd jk dkf kjd' },
  { id: 's-and-l', newKeys: ['s', 'l'], line: 'sss lll sl ls sdf lkj fds jkl' },
  { id: 'a-and-semicolon', newKeys: ['a', ';'], line: 'aaa ;;; a; ;a asdf jkl; fdsa ;lkj' },
  { id: 'home-row-words', newKeys: [], line: 'add all; ask dad; a flask; salads' },
  { id: 'g-and-h', newKeys: ['g', 'h'], line: 'fgf jhj had glad half flag hall' },
  { id: 'e-and-i', newKeys: ['e', 'i'], line: 'ded kik see fed lid kid hike side' },
  { id: 'r-and-u', newKeys: ['r', 'u'], line: 'frf juj red rug full sure ride fudge' },
  { id: 't-and-y', newKeys: ['t', 'y'], line: 'ftf jyj try yet the yard tidy treat' },
  { id: 'top-row-words', newKeys: [], line: 'the dark sky; she rides; tea is here' },
  { id: 'w-and-o', newKeys: ['w', 'o'], line: 'sws lol wow low owl word slow world' },
  { id: 'q-and-p', newKeys: ['q', 'p'], line: 'aqa ;p; quit pie paper equip quite' },
  { id: 'v-and-m', newKeys: ['v', 'm'], line: 'fvf jmj move more vote mime him have' },
  { id: 'c-and-comma', newKeys: ['c', ','], line: 'dcd k,k cat, cup, car, cook, rice' },
  { id: 'n-and-b', newKeys: ['n', 'b'], line: 'fbf jnj bin nab bun brown banana' },
  { id: 'x-and-period', newKeys: ['x', '.'], line: 'sxs l.l fox. box. six. next. exit.' },
  { id: 'z-and-slash', newKeys: ['z', '/'], line: 'aza ;/; zoo zip zebra lazy and/or' },
  { id: 'shift', newKeys: [SHIFT], line: 'Ann and Bob. Kim and Zoe. Lee met Max.' },
  { id: 'sentence-park', newKeys: [], line: 'My dog likes to run in the park.' },
  { id: 'sentence-picnic', newKeys: [], line: 'We packed six jugs of juice for a big picnic.' },
];

/**
 * Which finger presses a key in touch typing, by character. Shift is pressed with the little
 * finger of the other hand, and the thumbs take the space bar.
 */
export type Finger =
  | 'left-little'
  | 'left-ring'
  | 'left-middle'
  | 'left-pointer'
  | 'right-pointer'
  | 'right-middle'
  | 'right-ring'
  | 'right-little'
  | 'thumb';

const FINGER_KEYS: readonly (readonly [finger: Exclude<Finger, 'thumb'>, keys: string])[] = [
  ['left-little', 'qaz'],
  ['left-ring', 'wsx'],
  ['left-middle', 'edc'],
  ['left-pointer', 'rfvtgb'],
  ['right-pointer', 'yhnujm'],
  ['right-middle', 'ik,'],
  ['right-ring', 'ol.'],
  ['right-little', 'p;/'],
];

/** The finger for a character. A capital uses its letter's finger. */
export function fingerFor(char: string): Finger {
  if (char === ' ') return 'thumb';
  const lower = char.toLowerCase();
  const found = FINGER_KEYS.find(([, keys]) => keys.includes(lower));
  if (found !== undefined) return found[0];
  throw new RangeError(`The typing course has no finger for "${char}".`);
}

/** The Shift a capital needs: the one on the other hand from the letter. */
export function shiftFingerFor(char: string): Finger | null {
  if (char === char.toLowerCase()) return null;
  return fingerFor(char).startsWith('left') ? 'right-little' : 'left-little';
}

/** The `KeyboardEvent.code` of the key for a character on the keyboard picture. */
export function codeFor(char: string): string {
  if (char === ' ') return 'Space';
  const lower = char.toLowerCase();
  if (/^[a-z]$/.test(lower)) return `Key${lower.toUpperCase()}`;
  const code = PUNCTUATION_CODES[char];
  if (code === undefined) throw new RangeError(`The typing course has no key for "${char}".`);
  return code;
}

const PUNCTUATION_CODES: Readonly<Record<string, string>> = {
  ';': 'Semicolon',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
};

/** The pause after the last character, so the child sees the whole line typed. */
export const LINE_DONE_PAUSE_MS = 1200;
