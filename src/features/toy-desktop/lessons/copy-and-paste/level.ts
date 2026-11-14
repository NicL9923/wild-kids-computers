import { createRandom } from '../../../../core/activityKit/random.ts';
import type { Band } from '../../../../core/bands.ts';
import type { DesktopParts } from '../../desktop/parts.ts';
import { createToyClipboard } from '../../../../app/inputGuards.ts';
import { buildDesktop } from '../../model/build.ts';
import { reduceAll, type DesktopAction } from '../../model/desktop.ts';
import { LESSON_DESKTOP_SIZE, type LessonLevel } from '../harness/lesson.ts';

/** Which way the number travels. */
export type Direction = 'calculator-to-note' | 'note-to-calculator';

/** How the child runs copy and paste: from the Edit menu, or with shortcuts and no menu bar. */
export type Route = 'menu' | 'keys';

/**
 * Difficulty first turns the copy around, so the child selects before copying, then trades the
 * menu for shortcuts.
 */
const SHAPES: Readonly<Record<number, { direction: Direction; route: Route }>> = {
  1: { direction: 'calculator-to-note', route: 'menu' },
  2: { direction: 'note-to-calculator', route: 'menu' },
  3: { direction: 'calculator-to-note', route: 'keys' },
  4: { direction: 'note-to-calculator', route: 'keys' },
};

export const NOTEPAD_WINDOW = 'w1';
export const CALCULATOR_WINDOW = 'w2';

/** The words in front of the answer in the note, so the pasted number has a place. */
export const ANSWER_LEAD = 'The answer is ';

export interface CopyPasteLevel extends LessonLevel {
  readonly direction: Direction;
  readonly route: Route;
  /** The number that moves, as the calculator shows it. */
  readonly number: string;
}

function clampDifficulty(difficulty: number): number {
  return Math.min(Math.max(Math.round(difficulty), 1), 4);
}

function parts(route: Route): DesktopParts {
  return {
    icons: [],
    // With shortcuts, the menu bar is away, so the keys are the way to copy and paste.
    menuBar: route === 'menu',
    taskStrip: false,
    launcher: [],
    windowControls: [],
    move: false,
    resize: false,
    systemSound: false,
  };
}

/** The calculator keys that add two numbers, so it shows their sum as the child would get it. */
function sumKeys(a: number, b: number): DesktopAction[] {
  const digits = (value: number): DesktopAction[] =>
    String(value)
      .split('')
      .map((digit) => ({
        type: 'calculator',
        windowId: CALCULATOR_WINDOW,
        key: { type: 'digit', digit: Number(digit) },
      }));
  return [
    ...digits(a),
    { type: 'calculator', windowId: CALCULATOR_WINDOW, key: { type: 'operator', operator: 'add' } },
    ...digits(b),
    { type: 'calculator', windowId: CALCULATOR_WINDOW, key: { type: 'equals' } },
  ];
}

/**
 * A notepad and a calculator side by side. Either the calculator has worked out a sum that goes
 * into the note, or the note holds a number that goes into the calculator.
 */
export function generateLevel(seed: number, difficulty: number, _band: Band): CopyPasteLevel {
  const random = createRandom(seed);
  const shape = SHAPES[clampDifficulty(difficulty)];
  if (shape === undefined) throw new Error('copy-and-paste: every clamped difficulty has a shape');
  const a = random.int(12, 48);
  const b = random.int(11, 49);
  const fromCalculator = shape.direction === 'calculator-to-note';
  const number = String(fromCalculator ? a + b : random.int(100, 999));
  const built = buildDesktop({
    size: LESSON_DESKTOP_SIZE,
    windows: [
      {
        app: 'notepad',
        text: fromCalculator ? ANSWER_LEAD : number,
        at: { x: 24, y: 32 },
        size: { width: 380, height: 360 },
      },
      { app: 'calculator', at: { x: 424, y: 24 }, size: { width: 280, height: 440 } },
    ],
    // The child starts where the number is.
    focus: fromCalculator ? 1 : 0,
    settings: { iconSize: 'medium' },
  });
  // Working out the sum never touches the clipboard; a fresh one keeps the generator pure.
  const desktop = fromCalculator ? reduceAll(built, sumKeys(a, b), { clipboard: createToyClipboard() }).state : built;
  return { ...shape, number, parts: parts(shape.route), desktop };
}
