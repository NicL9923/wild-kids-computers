import { describe, expect, it } from 'vitest';
import { PICTURE_KEYS } from '../../shared/keyboardLayout.ts';
import activity from './activity.ts';
import {
  generateLevel,
  MAX_SHIFT_DIFFICULTY,
  NUMBER_ROW_SIGNS,
  PUNCTUATION_SIGNS,
  SHIFT_WORDS,
  shiftFor,
  STEPS,
  typedChar,
  UNSHIFTED,
} from './level.ts';
import { charSpeech, itemSpeech } from './speech.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 6007 + 3);
const DIFFICULTIES = Array.from({ length: MAX_SHIFT_DIFFICULTY }, (_, index) => index + 1);
const PICTURE_CODES = new Set(PICTURE_KEYS.map((key) => key.code));

describe('generateLevel', () => {
  it.each(DIFFICULTIES)('at difficulty %i gives distinct items that each need Shift', (difficulty) => {
    const step = STEPS[difficulty - 1];
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-9-12');
      expect(level.items).toHaveLength(step?.count ?? -1);
      expect(new Set(level.items.map((item) => item.text)).size).toBe(level.items.length);
      expect(level.help).toBe(step?.help);
      for (const item of level.items) {
        expect(item.chars.map((char) => char.char).join('')).toBe(item.text);
        expect(item.chars.some((char) => char.shift)).toBe(true);
        // Every key to press is on the keyboard picture, and the voice can name the item.
        for (const char of item.chars) expect(PICTURE_CODES).toContain(char.code);
        expect(itemSpeech(item).length).toBeGreaterThan(0);
      }
    }
  });

  it('adds signs, then words, and takes away help one small step at a time', () => {
    expect(STEPS.map((step) => `${String(step.count)} ${step.pool} ${step.help}`)).toEqual([
      '3 capitals keys',
      '4 capitals keys',
      '4 number-signs keys',
      '4 number-signs shift',
      '4 all-signs shift',
      '5 all-signs none',
      '3 words shift',
      '4 words none',
    ]);
  });

  it.each([
    [1, 'capital'],
    [2, 'capital'],
    [7, 'word'],
    [MAX_SHIFT_DIFFICULTY, 'word'],
  ])('at difficulty %i gives only %s items', (difficulty, kind) => {
    for (const seed of SEEDS) {
      for (const item of generateLevel(seed, difficulty, 'band-6-8').items) expect(item.kind).toBe(kind);
    }
  });

  it.each([3, 4, 5, 6])('at difficulty %i always has a sign, so the new step is practiced', (difficulty) => {
    for (const seed of SEEDS) {
      expect(generateLevel(seed, difficulty, 'band-6-8').items.some((item) => item.kind === 'sign')).toBe(true);
    }
  });

  it('keeps punctuation signs out until difficulty 5, and reaches every sign there', () => {
    const punctuation = Object.keys(PUNCTUATION_SIGNS);
    const early = new Set(SEEDS.flatMap((seed) => generateLevel(seed, 4, 'band-6-8').items.map((item) => item.text)));
    for (const sign of punctuation) expect(early).not.toContain(sign);
    const late = new Set(SEEDS.flatMap((seed) => generateLevel(seed, 5, 'band-6-8').items.map((item) => item.text)));
    for (const sign of [...punctuation, ...Object.keys(NUMBER_ROW_SIGNS)]) expect(late).toContain(sign);
  });

  it('gives each band a range inside the steps', () => {
    const ranges = activity.kind === 'rounds' ? activity.difficulty : {};
    expect(ranges).toEqual({ 'band-6-8': { min: 1, max: 6 }, 'band-9-12': { min: 3, max: MAX_SHIFT_DIFFICULTY } });
  });

  it.each([0, MAX_SHIFT_DIFFICULTY + 1, 2.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-6-8')).toThrow(/difficulty 1 to 8, not/);
  });
});

describe('typedChar', () => {
  it.each([
    ['A', 'KeyA', true],
    ['a', 'KeyA', false],
    ['!', 'Digit1', true],
    ['?', 'Slash', true],
    ['_', 'Minus', true],
  ])('types %s with %s, Shift %s', (char, code, shift) => {
    expect(typedChar(char)).toEqual({ char, code, shift });
  });

  it.each(['1', '~', ' ', 'é'])('rejects %j, which the activity does not teach', (char) => {
    expect(() => typedChar(char)).toThrow(/has no key for/);
  });

  it('shows the plain character for every sign key', () => {
    for (const code of [...Object.values(NUMBER_ROW_SIGNS), ...Object.values(PUNCTUATION_SIGNS)]) {
      expect(UNSHIFTED[code]).toMatch(/^.$/);
    }
  });
});

describe('shiftFor', () => {
  it.each([
    ['KeyA', 'ShiftRight'],
    ['Digit5', 'ShiftRight'],
    ['KeyB', 'ShiftRight'],
    ['KeyY', 'ShiftLeft'],
    ['Digit6', 'ShiftLeft'],
    ['Slash', 'ShiftLeft'],
  ])('holds Shift with the other hand from %s', (code, shift) => {
    expect(shiftFor(code)).toBe(shift);
  });
});

describe('speech', () => {
  it('says capitals as "capital" and the letter, and small letters alone', () => {
    expect(charSpeech('B').map((handle) => handle.id)).toEqual(['big-letters.capital', 'letter-names.b']);
    expect(charSpeech('b').map((handle) => handle.id)).toEqual(['letter-names.b']);
  });

  it('names every sign and every word', () => {
    for (const sign of [...Object.keys(NUMBER_ROW_SIGNS), ...Object.keys(PUNCTUATION_SIGNS)]) {
      expect(charSpeech(sign)).toHaveLength(1);
    }
    expect(new Set(SHIFT_WORDS.map((text) => itemSpeech({ kind: 'word', text })[0]?.id)).size).toBe(SHIFT_WORDS.length);
  });

  it.each([
    ['sign', '~', /no name for/],
    ['word', 'Hello!', /no word/],
  ] as const)('rejects a %s it cannot say: %s', (kind, text, reason) => {
    expect(() => itemSpeech({ kind, text })).toThrow(reason);
  });
});
