import { t, type SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { numberHandle } from '../../../../core/strings/shared/index.ts';
import type { CalculatorKey, CalculatorState } from '../../model/apps/calculator.ts';
import { useDesktopContext } from '../desktopContext.ts';
import { CALCULATOR_PROBLEMS } from '../labels.ts';
import { strings } from '../strings.ts';

interface KeySpec {
  readonly key: CalculatorKey;
  /** What the key shows: a digit or a sign. Signs are the same in every language the app has. */
  readonly face: string;
  readonly name: SpokenHandle;
  readonly kind: 'digit' | 'operator' | 'equals' | 'clear';
}

const digit = (value: number): KeySpec => ({
  key: { type: 'digit', digit: value },
  face: String(value),
  name: numberHandle(value),
  kind: 'digit',
});

const KEYPAD: readonly KeySpec[] = [
  { key: { type: 'clear' }, face: 'C', name: strings.clear, kind: 'clear' },
  { key: { type: 'backspace' }, face: '←', name: strings.back, kind: 'clear' },
  { key: { type: 'operator', operator: 'divide' }, face: '÷', name: strings.dividedBy, kind: 'operator' },
  { key: { type: 'operator', operator: 'multiply' }, face: '×', name: strings.times, kind: 'operator' },
  digit(7),
  digit(8),
  digit(9),
  { key: { type: 'operator', operator: 'subtract' }, face: '−', name: strings.minus, kind: 'operator' },
  digit(4),
  digit(5),
  digit(6),
  { key: { type: 'operator', operator: 'add' }, face: '+', name: strings.plus, kind: 'operator' },
  digit(1),
  digit(2),
  digit(3),
  { key: { type: 'equals' }, face: '=', name: strings.equals, kind: 'equals' },
  digit(0),
  { key: { type: 'point' }, face: '.', name: strings.point, kind: 'digit' },
];

/** Keyboard keys the calculator takes while its window has focus. */
export function calculatorKeyFor(key: string): CalculatorKey | null {
  if (/^\d$/.test(key)) return { type: 'digit', digit: Number(key) };
  switch (key) {
    case '.':
    case ',':
      return { type: 'point' };
    case '+':
      return { type: 'operator', operator: 'add' };
    case '-':
      return { type: 'operator', operator: 'subtract' };
    case '*':
    case 'x':
      return { type: 'operator', operator: 'multiply' };
    case '/':
      return { type: 'operator', operator: 'divide' };
    case '=':
    case 'Enter':
      return { type: 'equals' };
    case 'Escape':
      return { type: 'clear' };
    case 'Backspace':
      return { type: 'backspace' };
    default:
      return null;
  }
}

/** A pocket calculator. Typing digits and signs works too while its window has focus. */
export function CalculatorApp({
  windowId,
  app,
}: {
  readonly windowId: string;
  readonly app: CalculatorState;
  readonly focused: boolean;
}) {
  const { desktop, sayName } = useDesktopContext();
  return (
    <div className='td-calculator'>
      <output className='td-calculator-display' aria-label={t(strings.display)} data-calculator-display>
        {app.problem === null ? app.display : t(CALCULATOR_PROBLEMS[app.problem])}
      </output>
      <div className='td-calculator-keys'>
        {KEYPAD.map((spec) => (
          <button
            key={spec.face}
            type='button'
            className='td-calculator-key'
            data-key-kind={spec.kind}
            data-calculator-key={spec.face}
            data-pending={
              spec.key.type === 'operator' && app.pending?.operator === spec.key.operator && app.fresh
                ? 'true'
                : undefined
            }
            aria-label={t(spec.name)}
            {...sayName(spec.name)}
            onClick={() => desktop.dispatch({ type: 'calculator', windowId, key: spec.key })}
          >
            {spec.face}
          </button>
        ))}
      </div>
    </div>
  );
}
