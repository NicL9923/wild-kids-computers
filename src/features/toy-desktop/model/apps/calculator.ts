/**
 * A pocket calculator. Operations run left to right as they are entered, the way a pocket
 * calculator works: 2 + 3 × 4 = 20. Pressing equals again repeats the last operation.
 */

/** The most digits the display holds, as on a pocket calculator. */
export const CALCULATOR_MAX_DIGITS = 10;

export const OPERATORS = ['add', 'subtract', 'multiply', 'divide'] as const;
/** @public */
export type Operator = (typeof OPERATORS)[number];

export type CalculatorKey =
  | { type: 'digit'; digit: number }
  | { type: 'point' }
  | { type: 'operator'; operator: Operator }
  | { type: 'equals' }
  /** Clears everything, including a waiting operation. */
  | { type: 'clear' }
  /** Removes the last digit typed. */
  | { type: 'backspace' };

/**
 * A friendly stop instead of a wrong number. The display shows a picture or a short spoken
 * sentence; the next key starts over.
 */
export type CalculatorProblem = 'divide-by-zero' | 'too-big';

export interface CalculatorState {
  kind: 'calculator';
  /** The number on the display, such as "0", "12.5", or "-3". */
  display: string;
  /** The number on the left of a waiting operation. */
  stored: number | null;
  pending: Operator | null;
  /** True when the next digit starts a new number instead of adding to the display. */
  fresh: boolean;
  /** The last operation, so that pressing equals again repeats it. */
  repeat: { operator: Operator; operand: number } | null;
  problem: CalculatorProblem | null;
}

export function createCalculator(): CalculatorState {
  return { kind: 'calculator', display: '0', stored: null, pending: null, fresh: true, repeat: null, problem: null };
}

function digitCount(display: string): number {
  return display.replace(/\D/g, '').length;
}

function compute(left: number, operator: Operator, right: number): number | CalculatorProblem {
  switch (operator) {
    case 'add':
      return left + right;
    case 'subtract':
      return left - right;
    case 'multiply':
      return left * right;
    // 'divide', the last case.
    default:
      return right === 0 ? 'divide-by-zero' : left / right;
  }
}

/**
 * Formats a number for the display: at most `CALCULATOR_MAX_DIGITS` digits, rounded, with no
 * trailing zeros and never "-0". Returns null when the whole part needs more digits.
 */
export function formatNumber(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  const magnitude = Math.abs(value);
  const wholeDigits = String(Math.trunc(magnitude)).length;
  if (wholeDigits > CALCULATOR_MAX_DIGITS) return null;
  // toFixed rounds from the exact binary value the same way on every machine.
  const fixed = magnitude.toFixed(CALCULATOR_MAX_DIGITS - wholeDigits);
  // Rounding can carry into a new digit, as 9999999999.6 does.
  if (digitCount(fixed.replace(/\.\d*$/, '')) > CALCULATOR_MAX_DIGITS) return null;
  const trimmed = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
  return value < 0 && trimmed !== '0' ? `-${trimmed}` : trimmed;
}

function showResult(state: CalculatorState, result: number | CalculatorProblem): CalculatorState {
  const display = typeof result === 'number' ? formatNumber(result) : null;
  if (display === null) return { ...createCalculator(), problem: typeof result === 'number' ? 'too-big' : result };
  return { ...state, display, fresh: true, problem: null };
}

function typeDigit(state: CalculatorState, digit: number): CalculatorState {
  const text = String(digit);
  if (state.fresh) return { ...state, display: text, fresh: false };
  if (digitCount(state.display) >= CALCULATOR_MAX_DIGITS) return state;
  return { ...state, display: state.display === '0' ? text : state.display + text };
}

function typePoint(state: CalculatorState): CalculatorState {
  if (state.fresh) return { ...state, display: '0.', fresh: false };
  if (state.display.includes('.') || digitCount(state.display) >= CALCULATOR_MAX_DIGITS) return state;
  return { ...state, display: `${state.display}.` };
}

function chooseOperator(state: CalculatorState, operator: Operator): CalculatorState {
  // Pressing a second operator before a new number changes the operation.
  if (state.pending !== null && state.fresh) return { ...state, pending: operator };
  if (state.pending !== null && state.stored !== null) {
    const shown = showResult(state, compute(state.stored, state.pending, Number(state.display)));
    if (shown.problem !== null) return shown;
    return { ...shown, stored: Number(shown.display), pending: operator, repeat: null };
  }
  return { ...state, stored: Number(state.display), pending: operator, fresh: true, repeat: null };
}

function equals(state: CalculatorState): CalculatorState {
  if (state.pending !== null && state.stored !== null) {
    const operand = Number(state.display);
    const shown = showResult(state, compute(state.stored, state.pending, operand));
    if (shown.problem !== null) return shown;
    return { ...shown, stored: null, pending: null, repeat: { operator: state.pending, operand } };
  }
  if (state.repeat !== null) {
    return showResult(state, compute(Number(state.display), state.repeat.operator, state.repeat.operand));
  }
  return { ...state, fresh: true };
}

function backspace(state: CalculatorState): CalculatorState {
  if (state.fresh) return state;
  const shorter = state.display.slice(0, -1);
  return { ...state, display: shorter === '' || shorter === '-' ? '0' : shorter };
}

/** Presses one key. A key after a problem starts over first, so the child is never stuck. */
export function pressKey(state: CalculatorState, key: CalculatorKey): CalculatorState {
  const start = state.problem === null ? state : createCalculator();
  switch (key.type) {
    case 'digit':
      return Number.isInteger(key.digit) && key.digit >= 0 && key.digit <= 9 ? typeDigit(start, key.digit) : state;
    case 'point':
      return typePoint(start);
    case 'operator':
      return state.problem === null ? chooseOperator(start, key.operator) : start;
    case 'equals':
      return state.problem === null ? equals(start) : start;
    case 'clear':
      return createCalculator();
    // 'backspace', the last case.
    default:
      return backspace(start);
  }
}

/**
 * Puts pasted text on the display as the number being typed. Returns null when the text is not
 * a plain number such as "12", "-3.5", or ".5", or when it does not fit the display.
 */
export function pasteNumber(state: CalculatorState, text: string): CalculatorState | null {
  const trimmed = text.trim();
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;
  const display = formatNumber(Number(trimmed));
  if (display === null) return null;
  const base = state.problem === null ? state : createCalculator();
  return { ...base, display, fresh: false };
}

/** The text copy takes from the display, or null while a problem shows. */
export function copyableNumber(state: CalculatorState): string | null {
  return state.problem === null ? state.display : null;
}
