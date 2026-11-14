import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import { isLetter, LETTERS, letterCode } from '../../shared/keyboardLayout.ts';

/**
 * Big letters: one thing to type at a time that needs Shift, such as a capital letter, a sign on
 * the number row, or a short word with a capital and a sign. Difficulty adds signs, then words
 * that mix Shift with plain keys, and takes away the help: first the keyboard picture lights
 * Shift and the key, then only Shift, then nothing.
 *
 * The keyboard picture is a plain US layout, so the signs and their keys are the US ones. The
 * activity checks the character typed, not the key, so another layout that types the same sign
 * also counts.
 */

/** How the screen helps: light Shift and the key, light only Shift, or show nothing. */
type ShiftHelp = 'keys' | 'shift' | 'none';

/** One character to type, with the key that makes it on a US keyboard. */
export interface TypedChar {
  readonly char: string;
  /** The `KeyboardEvent.code` of its key. */
  readonly code: string;
  readonly shift: boolean;
}

/** Signs Shift makes on the number row of a US keyboard. */
export const NUMBER_ROW_SIGNS: Readonly<Record<string, string>> = {
  '!': 'Digit1',
  '@': 'Digit2',
  '#': 'Digit3',
  $: 'Digit4',
  '%': 'Digit5',
  '&': 'Digit7',
  '*': 'Digit8',
  '(': 'Digit9',
  ')': 'Digit0',
};

/** Signs Shift makes on the keys beside the letters. */
export const PUNCTUATION_SIGNS: Readonly<Record<string, string>> = {
  '?': 'Slash',
  ':': 'Semicolon',
  '"': 'Quote',
  '+': 'Equal',
  _: 'Minus',
  '<': 'Comma',
  '>': 'Period',
};

/** The plain characters on the same keys, which a key cap shows under the sign. */
export const UNSHIFTED: Readonly<Record<string, string>> = {
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  Digit5: '5',
  Digit7: '7',
  Digit8: '8',
  Digit9: '9',
  Digit0: '0',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  Equal: '=',
  Minus: '-',
  Comma: ',',
  Period: '.',
};

/** Short words that start with a capital and end with a sign: Shift on, off, and on again. */
export const SHIFT_WORDS = ['Hi!', 'Go!', 'OK?', 'Yes!', 'Who?', 'Up!', 'Me?', 'No!'] as const;

export type ShiftWord = (typeof SHIFT_WORDS)[number];

type ItemPool = 'capitals' | 'number-signs' | 'all-signs' | 'words';

export interface Step {
  readonly count: number;
  /** Where the items come from. Each pool adds to the one before, except words. */
  readonly pool: ItemPool;
  readonly help: ShiftHelp;
}

/** One entry per difficulty, 1 first. Each step changes one thing. */
export const STEPS: readonly Step[] = [
  { count: 3, pool: 'capitals', help: 'keys' },
  { count: 4, pool: 'capitals', help: 'keys' },
  { count: 4, pool: 'number-signs', help: 'keys' },
  { count: 4, pool: 'number-signs', help: 'shift' },
  { count: 4, pool: 'all-signs', help: 'shift' },
  { count: 5, pool: 'all-signs', help: 'none' },
  { count: 3, pool: 'words', help: 'shift' },
  { count: 4, pool: 'words', help: 'none' },
];

export const MAX_SHIFT_DIFFICULTY = STEPS.length;

/** The pause after an item is typed, so the child sees it whole before the next one. */
export const NEXT_ITEM_MS = 900;

export interface ShiftItem {
  readonly kind: 'capital' | 'sign' | 'word';
  readonly text: string;
  readonly chars: readonly TypedChar[];
}

export interface ShiftLevel {
  /** The items, in order. No item repeats within a round. */
  readonly items: readonly ShiftItem[];
  readonly help: ShiftHelp;
}

const SIGN_CODES: Readonly<Record<string, string>> = { ...NUMBER_ROW_SIGNS, ...PUNCTUATION_SIGNS };

/** The key and Shift for one character on a US keyboard. Throws for one the activity does not use. */
export function typedChar(char: string): TypedChar {
  const lower = char.toLowerCase();
  if (isLetter(lower)) return { char, code: letterCode(lower), shift: char !== lower };
  const code = SIGN_CODES[char];
  if (code === undefined) throw new RangeError(`Big letters has no key for "${char}".`);
  return { char, code, shift: true };
}

function item(kind: ShiftItem['kind'], text: string): ShiftItem {
  return { kind, text, chars: Array.from(text, typedChar) };
}

const CAPITALS = LETTERS.map((letter) => letter.toUpperCase());

function itemsOf(pool: ItemPool): ShiftItem[] {
  const capitals = CAPITALS.map((text) => item('capital', text));
  const numberSigns = Object.keys(NUMBER_ROW_SIGNS).map((text) => item('sign', text));
  switch (pool) {
    case 'capitals':
      return capitals;
    case 'number-signs':
      return [...capitals, ...numberSigns];
    case 'all-signs':
      return [...capitals, ...numberSigns, ...Object.keys(PUNCTUATION_SIGNS).map((text) => item('sign', text))];
    // 'words', the last case.
    default:
      return SHIFT_WORDS.map((text) => item('word', text));
  }
}

function stepFor(difficulty: number): Step {
  const step = STEPS[difficulty - 1];
  if (!Number.isInteger(difficulty) || step === undefined) {
    throw new RangeError(`Big letters has difficulty 1 to ${String(MAX_SHIFT_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return step;
}

/**
 * Pure: the same seed and difficulty give the same items. The band does not change them. A round
 * that draws from a pool with signs always has at least one sign, so the step teaches what it adds.
 */
export function generateLevel(seed: number, difficulty: number, _band: Band): ShiftLevel {
  const step = stepFor(difficulty);
  const random = createRandom(seed);
  const pool = itemsOf(step.pool);
  if (step.pool === 'capitals' || step.pool === 'words') {
    return { items: random.sample(pool, step.count), help: step.help };
  }
  const signs = pool.filter((entry) => entry.kind === 'sign');
  const sign = random.pick(signs);
  const rest = random.sample(
    pool.filter((entry) => entry !== sign),
    step.count - 1,
  );
  return { items: random.shuffle([sign, ...rest]), help: step.help };
}

/** Keys the left hand presses in touch typing. */
const LEFT_HAND_CODES = new Set([
  'Backquote',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'KeyQ',
  'KeyW',
  'KeyE',
  'KeyR',
  'KeyT',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyF',
  'KeyG',
  'KeyZ',
  'KeyX',
  'KeyC',
  'KeyV',
  'KeyB',
]);

/** The Shift key on the other hand from the key, as touch typists use it. */
export function shiftFor(code: string): 'ShiftLeft' | 'ShiftRight' {
  return LEFT_HAND_CODES.has(code) ? 'ShiftRight' : 'ShiftLeft';
}
