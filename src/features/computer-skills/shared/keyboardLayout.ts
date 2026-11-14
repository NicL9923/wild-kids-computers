/**
 * The keys of the keyboard picture, named by `KeyboardEvent.code`: the physical place of a key,
 * whatever letter the layout puts on it. The picture is a plain US layout. Widths are in key
 * units; every main row adds up to MAIN_WIDTH, so the right edge is straight.
 */

const MAIN_WIDTH = 15;
/** The arrow keys sit to the right of the main block, after a half-key gap. */
const ARROW_GAP = 0.5;
export const PICTURE_WIDTH = MAIN_WIDTH + ARROW_GAP + 3;
export const PICTURE_ROWS = 5;

/** What a key shows: a letter, a digit, a drawn symbol, or nothing. */
type KeyFace =
  | { readonly kind: 'letter'; readonly letter: Letter }
  | { readonly kind: 'digit'; readonly digit: number }
  | { readonly kind: 'symbol'; readonly symbol: 'enter' | 'backspace' | 'shift' | 'tab' | 'arrow' }
  | { readonly kind: 'blank' };

export const LETTERS = [
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

export type Letter = (typeof LETTERS)[number];

export function isLetter(value: string): value is Letter {
  return (LETTERS as readonly string[]).includes(value);
}

export interface PictureKey {
  /** The `KeyboardEvent.code` of the key. */
  readonly code: string;
  readonly row: number;
  /** Left edge and width, in key units. */
  readonly x: number;
  readonly width: number;
  readonly face: KeyFace;
  /** For an arrow key, which way it points, in degrees clockwise from up. */
  readonly turn?: number;
}

type Spec = readonly [code: string, width: number, face?: KeyFace];

const blank: KeyFace = { kind: 'blank' };
const letter = (value: Letter): Spec => [`Key${value.toUpperCase()}`, 1, { kind: 'letter', letter: value }];
const digit = (value: number): Spec => [`Digit${String(value)}`, 1, { kind: 'digit', digit: value }];
const symbol = (code: string, width: number, value: 'enter' | 'backspace' | 'shift' | 'tab'): Spec => [
  code,
  width,
  { kind: 'symbol', symbol: value },
];
const letters = (values: readonly Letter[]): Spec[] => values.map(letter);

const ROWS: readonly (readonly Spec[])[] = [
  [
    ['Backquote', 1],
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(digit),
    ['Minus', 1],
    ['Equal', 1],
    symbol('Backspace', 2, 'backspace'),
  ],
  [
    symbol('Tab', 1.5, 'tab'),
    ...letters(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']),
    ['BracketLeft', 1],
    ['BracketRight', 1],
    ['Backslash', 1.5],
  ],
  [
    ['CapsLock', 1.75],
    ...letters(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l']),
    ['Semicolon', 1],
    ['Quote', 1],
    symbol('Enter', 2.25, 'enter'),
  ],
  [
    symbol('ShiftLeft', 2.25, 'shift'),
    ...letters(['z', 'x', 'c', 'v', 'b', 'n', 'm']),
    ['Comma', 1],
    ['Period', 1],
    ['Slash', 1],
    symbol('ShiftRight', 2.75, 'shift'),
  ],
  [
    ['ControlLeft', 2],
    ['AltLeft', 2],
    ['Space', 7],
    ['AltRight', 2],
    ['ControlRight', 2],
  ],
];

function layout(): PictureKey[] {
  const keys: PictureKey[] = [];
  ROWS.forEach((specs, row) => {
    let x = 0;
    for (const [code, width, face = blank] of specs) {
      keys.push({ code, row, x, width, face });
      x += width;
    }
  });
  const arrowsX = MAIN_WIDTH + ARROW_GAP;
  const arrow: KeyFace = { kind: 'symbol', symbol: 'arrow' };
  keys.push(
    { code: 'ArrowUp', row: 3, x: arrowsX + 1, width: 1, face: arrow, turn: 0 },
    { code: 'ArrowLeft', row: 4, x: arrowsX, width: 1, face: arrow, turn: 270 },
    { code: 'ArrowDown', row: 4, x: arrowsX + 1, width: 1, face: arrow, turn: 180 },
    { code: 'ArrowRight', row: 4, x: arrowsX + 2, width: 1, face: arrow, turn: 90 },
  );
  return keys;
}

export const PICTURE_KEYS: readonly PictureKey[] = layout();

/** The code of the key that carries a letter in the picture, such as `KeyB` for b. */
export function letterCode(value: Letter): string {
  return `Key${value.toUpperCase()}`;
}

/** The picture's row of a key, or null for a key the picture does not show. */
export function rowOf(code: string): number | null {
  return PICTURE_KEYS.find((key) => key.code === code)?.row ?? null;
}
