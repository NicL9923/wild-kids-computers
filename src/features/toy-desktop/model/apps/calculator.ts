/**
 * A pocket calculator. Operations run left to right as they are entered, the way a pocket
 * calculator works: 2 + 3 × 4 = 20. Pressing equals again repeats the last operation.
 */

/** The most digits the display holds, as on a pocket calculator. A leading zero counts. */
export const CALCULATOR_MAX_DIGITS = 10;

/** The first number too big for the display. */
const DISPLAY_LIMIT = 10 ** CALCULATOR_MAX_DIGITS;

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
  /** An operation waiting for its second number, with the number on its left. */
  pending: { operator: Operator; left: number } | null;
  /** True when the next digit starts a new number instead of adding to the display. */
  fresh: boolean;
  /** The last operation, so that pressing equals again repeats it. */
  repeat: { operator: Operator; operand: number } | null;
  problem: CalculatorProblem | null;
}

export function createCalculator(): CalculatorState {
  return { kind: 'calculator', display: '0', pending: null, fresh: true, repeat: null, problem: null };
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
  const magnitude = Math.abs(value);
  // NaN fails this test too.
  if (!(magnitude < DISPLAY_LIMIT)) return null;
  const wholeDigits = String(Math.trunc(magnitude)).length;
  // toFixed rounds from the exact binary value the same way on every machine.
  const fixed = magnitude.toFixed(CALCULATOR_MAX_DIGITS - wholeDigits);
  // Rounding can carry into a new digit, as 9999999999.6 does.
  if (Number(fixed) >= DISPLAY_LIMIT) return null;
  const trimmed = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
  // A value that rounds to zero shows "0", never "-0".
  return value < 0 && trimmed !== '0' ? `-${trimmed}` : trimmed;
}

/** Shows a result and gets ready for a new number, or shows a problem and starts over. */
function showResult(state: CalculatorState, result: number | CalculatorProblem): CalculatorState {
  if (typeof result === 'string') return { ...createCalculator(), problem: result };
  const display = formatNumber(result);
  if (display === null) return { ...createCalculator(), problem: 'too-big' };
  return { ...state, display, fresh: true };
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
  const { pending } = state;
  // Pressing a second operator before a new number changes the operation.
  if (pending !== null && state.fresh) return { ...state, pending: { ...pending, operator } };
  const shown =
    pending === null ? state : showResult(state, compute(pending.left, pending.operator, Number(state.display)));
  if (shown.problem !== null) return shown;
  return { ...shown, pending: { operator, left: Number(shown.display) }, fresh: true, repeat: null };
}

function equals(state: CalculatorState): CalculatorState {
  const { pending, repeat } = state;
  if (pending !== null) {
    const operand = Number(state.display);
    const shown = showResult(state, compute(pending.left, pending.operator, operand));
    if (shown.problem !== null) return shown;
    return { ...shown, pending: null, repeat: { operator: pending.operator, operand } };
  }
  if (repeat !== null) return showResult(state, compute(Number(state.display), repeat.operator, repeat.operand));
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
      // After a problem, an operator only clears it: there is no number to work on.
      return state.problem === null ? chooseOperator(start, key.operator) : start;
    case 'equals':
      return equals(start);
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
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(trimmed)) return null;
  const display = formatNumber(Number(trimmed));
  if (display === null) return null;
  const base = state.problem === null ? state : createCalculator();
  return { ...base, display, fresh: false };
}

/** The text copy takes from the display, or null while a problem shows. */
export function copyableNumber(state: CalculatorState): string | null {
  return state.problem === null ? state.display : null;
}
