import { describe, expect, it } from 'vitest';
import {
  CALCULATOR_MAX_DIGITS,
  copyableNumber,
  createCalculator,
  formatNumber,
  pasteNumber,
  pressKey,
  type CalculatorKey,
  type CalculatorState,
} from './calculator.ts';

const OPERATOR_KEYS: Record<string, CalculatorKey> = {
  '+': { type: 'operator', operator: 'add' },
  '-': { type: 'operator', operator: 'subtract' },
  '*': { type: 'operator', operator: 'multiply' },
  '/': { type: 'operator', operator: 'divide' },
  '=': { type: 'equals' },
  '.': { type: 'point' },
  C: { type: 'clear' },
  '<': { type: 'backspace' },
};

/** Presses keys written as a string, such as "12+3=". */
function press(keys: string, state: CalculatorState = createCalculator()): CalculatorState {
  return Array.from(keys).reduce((current, key) => {
    const mapped = OPERATOR_KEYS[key] ?? { type: 'digit', digit: Number(key) };
    return pressKey(current, mapped);
  }, state);
}

describe('pressKey', () => {
  it.each([
    ['typing a number', '123', '123'],
    ['a leading zero is replaced', '007', '7'],
    ['adding', '12+30=', '42'],
    ['subtracting below zero', '3-5=', '-2'],
    ['multiplying', '6*7=', '42'],
    ['dividing', '7/2=', '3.5'],
    ['chaining runs left to right', '2+3*4=', '20'],
    ['an operator shows the running result', '2+3*', '5'],
    ['a second operator replaces the first', '8+-3=', '5'],
    ['equals again repeats the last operation', '2+3===', '11'],
    ['equals with no second number uses the first', '5+=', '10'],
    ['a digit after equals starts a new number', '2+3=7', '7'],
    ['an operator after equals continues from the result', '2+3=*2=', '10'],
    ['equals alone does nothing', '5=', '5'],
    ['a point starts a decimal', '.5', '0.5'],
    ['a second point is ignored', '1.2.3', '1.23'],
    ['a point after an operator starts a new number', '3+.5=', '3.5'],
    ['tidy floating point sums', '.1+.2=', '0.3'],
    ['a long result rounds to the digit limit, the leading zero included', '2/3=', '0.666666667'],
    ['backspace removes the last digit', '123<', '12'],
    ['backspace on the last digit leaves zero', '5<', '0'],
    ['backspace leaves a result alone', '2+3=<', '5'],
    ['backspace leaves no lone minus', '0-7=*1=', '-7'],
    ['clear starts over', '12+3C', '0'],
    ['clear drops the waiting operation', '12+C4=', '4'],
  ])('%s: %s shows %s', (_label, keys, display) => {
    expect(press(keys).display).toBe(display);
  });

  it(`stops at ${CALCULATOR_MAX_DIGITS} digits, counting digits after the point`, () => {
    expect(press('12345678901').display).toBe('1234567890');
    expect(press('1.234567890').display).toBe('1.234567890');
    expect(press('1.2345678901').display).toBe('1.234567890');
  });

  it('refuses a point when the display is full', () => {
    expect(press('1234567890.').display).toBe('1234567890');
  });

  it('shows a friendly problem for dividing by zero, then starts over on the next key', () => {
    const divided = press('8/0=');
    expect(divided).toMatchObject({ problem: 'divide-by-zero', display: '0', pending: null });
    expect(press('4', divided)).toMatchObject({ problem: null, display: '4' });
    expect(press('+', divided)).toMatchObject({ problem: null, display: '0', pending: null });
    expect(press('=', divided)).toMatchObject({ problem: null, display: '0' });
  });

  it('catches dividing by zero in the middle of a chain', () => {
    expect(press('8/0+').problem).toBe('divide-by-zero');
  });

  it('shows a problem when a result is too big for the display', () => {
    expect(press('99999*999999*').problem).toBe('too-big');
    expect(press('9999999999+1=').problem).toBe('too-big');
  });

  it('keeps the largest number that fits', () => {
    expect(press('9999999998+1=')).toMatchObject({ problem: null, display: '9999999999' });
  });

  it('ignores a digit key that is not a single digit', () => {
    const state = press('1');
    expect(pressKey(state, { type: 'digit', digit: 12 })).toBe(state);
    expect(pressKey(state, { type: 'digit', digit: -1 })).toBe(state);
    expect(pressKey(state, { type: 'digit', digit: 1.5 })).toBe(state);
  });
});

describe('formatNumber', () => {
  it.each([
    [0, '0'],
    [-0, '0'],
    [-0.00000000001, '0'],
    [1.5, '1.5'],
    [-1.5, '-1.5'],
    [100, '100'],
    [0.000000001, '0.000000001'],
    [1234567890.4, '1234567890'],
  ])('shows %d as %s', (value, display) => {
    expect(formatNumber(value)).toBe(display);
  });

  it.each([
    ['too many whole digits', 12345678901],
    ['rounding that carries into an eleventh digit', 9999999999.6],
    ['infinity', Infinity],
    ['not a number', Number.NaN],
  ])('gives null for %s', (_label, value) => {
    expect(formatNumber(value)).toBeNull();
  });
});

describe('copy and paste', () => {
  it('copies the display, but not while a problem shows', () => {
    expect(copyableNumber(press('42'))).toBe('42');
    expect(copyableNumber(press('1/0='))).toBeNull();
  });

  it.each([
    ['a whole number', ' 12 ', '12'],
    ['a negative decimal', '-3.5', '-3.5'],
    ['a decimal without a leading zero', '.5', '0.5'],
    ['a long decimal, rounded to fit', '0.123456789012', '0.123456789'],
  ])('pastes %s', (_label, text, display) => {
    expect(pasteNumber(createCalculator(), text)).toMatchObject({ display, fresh: false });
  });

  it.each([
    ['words', 'twelve'],
    ['two numbers', '1 2'],
    ['an empty string', ''],
    ['a lone point', '.'],
    ['a number too big for the display', '123456789012'],
    ['scientific notation', '1e5'],
  ])('refuses %s', (_label, text) => {
    expect(pasteNumber(createCalculator(), text)).toBeNull();
  });

  it('clears a problem when a number is pasted', () => {
    expect(pasteNumber(press('1/0='), '7')).toMatchObject({ display: '7', problem: null });
  });

  it('lets the child keep typing after a paste', () => {
    const pasted = pasteNumber(createCalculator(), '12');
    if (pasted === null) throw new Error('paste failed');
    expect(press('3', pasted).display).toBe('123');
  });
});
