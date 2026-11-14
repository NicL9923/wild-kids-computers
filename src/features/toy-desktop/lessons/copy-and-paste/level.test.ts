import { describe, expect, it } from 'vitest';
import { createToyClipboard } from '../../../../app/inputGuards.ts';
import type { Band } from '../../../../core/bands.ts';
import type { OsFamily } from '../../../../core/platform/bridge.ts';
import { withDefaults } from '../../desktop/parts.ts';
import type { DesktopAction } from '../../model/desktop.ts';
import type { CommandId } from '../../model/commands.ts';
import { findWindow } from '../../model/state.ts';
import { LESSON_DESKTOP_SIZE } from '../harness/lesson.ts';
import { playSteps } from '../harness/playSteps.ts';
import activity from './activity.ts';
import { ANSWER_LEAD, CALCULATOR_WINDOW, generateLevel, NOTEPAD_WINDOW, type CopyPasteLevel } from './level.ts';
import { copyPasteSay, copyPasteSteps } from './steps.ts';
import { strings } from './strings.ts';

const ICON_ROOM = 320;
const SEEDS = Array.from({ length: 200 }, (_, index) => index * 7_919 + 11);

function rangeOf(band: Band): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error('copy-and-paste is a rounds activity');
  const range = activity.difficulty[band];
  if (range === undefined) throw new Error(`no range for ${band}`);
  return range;
}

/** What makes a round fair: the number shows in the app it comes from, and nowhere else yet. */
function problems(level: CopyPasteLevel): string[] {
  const found: string[] = [];
  const note = findWindow(level.desktop, NOTEPAD_WINDOW)?.app;
  const calculator = findWindow(level.desktop, CALCULATOR_WINDOW)?.app;
  if (note?.kind !== 'notepad' || calculator?.kind !== 'calculator') return ['the two apps are not open'];
  if (level.direction === 'calculator-to-note') {
    if (calculator.display !== level.number) found.push('the calculator does not show the answer');
    if (note.editor.text !== ANSWER_LEAD) found.push('the note does not wait for the answer');
  } else {
    if (note.editor.text !== level.number) found.push('the note does not hold just the number');
    if (calculator.display !== '0') found.push('the calculator is not clear');
  }
  if (!/^\d{2,3}$/.test(level.number)) found.push('the number is not two or three digits');
  const left = findWindow(level.desktop, NOTEPAD_WINDOW)?.rect;
  const right = findWindow(level.desktop, CALCULATOR_WINDOW)?.rect;
  if (left === undefined || right === undefined) return found;
  if (left.x + left.width > right.x) found.push('the windows overlap');
  for (const { x, y, width, height } of [left, right]) {
    if (x < 0 || y < 0 || y + height > LESSON_DESKTOP_SIZE.height) found.push('a window leaves the desktop');
    if (x + width > LESSON_DESKTOP_SIZE.width - ICON_ROOM) found.push('a window reaches the right edge');
  }
  // The child starts in the app the number comes from.
  const source = level.direction === 'calculator-to-note' ? CALCULATOR_WINDOW : NOTEPAD_WINDOW;
  if (level.desktop.focusedWindowId !== source) found.push('the round does not start in the source app');
  return found;
}

const focus = (windowId: string) => (): DesktopAction => ({ type: 'focus-window', windowId });
/** The child selects only the first digit with the pointer. */
const firstDigit = (): DesktopAction => ({
  type: 'text',
  windowId: NOTEPAD_WINDOW,
  field: 'document',
  op: { type: 'select', anchor: 0, caret: 1 },
});
const command = (windowId: string, run: CommandId) => (): DesktopAction => ({
  type: 'command',
  windowId,
  command: run,
});

/** What a child does, by menu or by shortcut alike: the model sees the same commands. */
function childActions(level: CopyPasteLevel): (() => DesktopAction)[] {
  if (level.direction === 'calculator-to-note') {
    return [
      focus(CALCULATOR_WINDOW),
      command(CALCULATOR_WINDOW, 'copy'),
      focus(NOTEPAD_WINDOW),
      command(NOTEPAD_WINDOW, 'paste'),
    ];
  }
  return [
    focus(NOTEPAD_WINDOW),
    command(NOTEPAD_WINDOW, 'select-all'),
    command(NOTEPAD_WINDOW, 'copy'),
    focus(CALCULATOR_WINDOW),
    command(CALCULATOR_WINDOW, 'paste'),
  ];
}

describe.each(['band-6-8', 'band-9-12'] as const)('copy and paste for %s', (band) => {
  const { min, max } = rangeOf(band);

  it.each([min, max])('is fair and solvable at difficulty %i for every seed', (difficulty) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, band);
      expect(problems(level), `seed ${seed}`).toEqual([]);
      const steps = copyPasteSteps(level, 'linux');
      const played = playSteps(level.desktop, steps, childActions(level));
      expect(played, `seed ${seed}`).toMatchObject({ done: steps.length, wrong: 0, rejected: [] });
    }
  });
});

describe('copy and paste difficulty', () => {
  // The design: which way the number goes, and whether the menu or the keys run the commands.
  it.each([
    [1, 'calculator-to-note', 'menu', 2],
    [2, 'note-to-calculator', 'menu', 3],
    [3, 'calculator-to-note', 'keys', 2],
    [4, 'note-to-calculator', 'keys', 3],
  ] as const)('at %i goes %s by %s in %i steps', (difficulty, direction, route, count) => {
    const level = generateLevel(7, difficulty, 'band-9-12');
    expect([level.direction, level.route]).toEqual([direction, route]);
    expect(copyPasteSteps(level, 'windows')).toHaveLength(count);
    // The menu bar is there only for the menu route, so the shortcut rounds need the keys.
    expect(withDefaults(level.parts).menuBar).toBe(route === 'menu');
  });

  it('keeps a difficulty outside the range at the nearest end', () => {
    expect(generateLevel(5, 0, 'band-6-8')).toEqual(generateLevel(5, 1, 'band-6-8'));
    expect(generateLevel(5, 9, 'band-9-12')).toEqual(generateLevel(5, 4, 'band-9-12'));
  });

  it('works out a different sum across seeds', () => {
    expect(new Set(SEEDS.map((seed) => generateLevel(seed, 1, 'band-6-8').number)).size).toBeGreaterThan(30);
  });
});

describe('copy and paste speech', () => {
  it.each([
    ['menu', 'mac', strings.calculatorCopy],
    ['keys', 'windows', strings.calculatorCopyCtrl],
    ['keys', 'linux', strings.calculatorCopyCtrl],
    ['keys', 'mac', strings.calculatorCopyCmd],
  ] as const)('says the %s way on %s', (route, os: OsFamily, handle) => {
    expect(copyPasteSay('calculatorCopy', route, os)).toBe(handle);
  });

  it('names the modifier of the computer in every shortcut step', () => {
    const level = generateLevel(3, 4, 'band-9-12');
    for (const os of ['mac', 'windows'] as const) {
      const ids = copyPasteSteps(level, os).flatMap((step) =>
        step.instruction !== undefined && 'id' in step.instruction ? [step.instruction.id] : [],
      );
      expect(ids).toHaveLength(3);
      expect(ids.every((id) => id.endsWith(os === 'mac' ? 'Cmd' : 'Ctrl'))).toBe(true);
    }
  });
});

describe('copy and paste steps', () => {
  it('counts a paste back into the calculator as a try, and points at the note', () => {
    const level = generateLevel(11, 1, 'band-6-8');
    const steps = copyPasteSteps(level, 'linux');
    const played = playSteps(level.desktop, steps, [
      command(CALCULATOR_WINDOW, 'copy'),
      command(CALCULATOR_WINDOW, 'paste'),
      command(CALCULATOR_WINDOW, 'paste'),
    ]);
    expect(played).toMatchObject({ done: 1, wrong: 2, rejected: [] });
    expect(played.hints).toEqual([{ kind: 'title-bar', windowId: NOTEPAD_WINDOW }]);
    const inNote = playSteps(played.state, steps.slice(1), [focus(NOTEPAD_WINDOW)]);
    expect(steps[1]?.hint?.(inNote.state)).toEqual({ kind: 'menu', menu: 'edit' });
  });

  it.each([
    [
      'clears the calculator before copying',
      1,
      [() => ({ type: 'calculator', windowId: CALCULATOR_WINDOW, key: { type: 'clear' } }) as const],
    ],
    [
      'deletes a digit of the number from the note',
      2,
      [() => ({ type: 'text', windowId: NOTEPAD_WINDOW, field: 'document', op: { type: 'backspace' } }) as const],
    ],
  ] as const)('puts the number back when the child %s, and counts no try', (_label, difficulty, actions) => {
    const level = generateLevel(11, difficulty, 'band-6-8');
    const steps = copyPasteSteps(level, 'linux');
    const played = playSteps(level.desktop, steps, actions);
    expect(played).toMatchObject({ done: 0, wrong: 0, restored: 1, rejected: [] });
    expect(played.state).toBe(level.desktop);
  });

  it('puts the number back in the note when the child deletes it after copying something else', () => {
    const level = generateLevel(11, 2, 'band-6-8');
    const clipboard = createToyClipboard();
    const played = playSteps(
      level.desktop,
      copyPasteSteps(level, 'linux'),
      [
        command(NOTEPAD_WINDOW, 'select-all'),
        command(NOTEPAD_WINDOW, 'copy'),
        () => {
          // Something else reached the clipboard since, so the note is the only place left.
          clipboard.write({ kind: 'text', text: 'apples' });
          return { type: 'text', windowId: NOTEPAD_WINDOW, field: 'document', op: { type: 'backspace' } };
        },
      ],
      { clipboard },
    );
    expect(played).toMatchObject({ done: 2, wrong: 0, restored: 1 });
  });

  it('keeps the round going while the copied number is still on the clipboard', () => {
    const level = generateLevel(11, 1, 'band-6-8');
    const played = playSteps(level.desktop, copyPasteSteps(level, 'linux'), [
      command(CALCULATOR_WINDOW, 'copy'),
      () => ({ type: 'calculator', windowId: CALCULATOR_WINDOW, key: { type: 'clear' } }),
      command(NOTEPAD_WINDOW, 'paste'),
    ]);
    expect(played).toMatchObject({ restored: 0 });
  });

  it('does not take typing the number for pasting it', () => {
    const level = generateLevel(11, 1, 'band-6-8');
    const played = playSteps(level.desktop, copyPasteSteps(level, 'linux'), [
      command(CALCULATOR_WINDOW, 'copy'),
      focus(NOTEPAD_WINDOW),
      () => ({ type: 'text', windowId: NOTEPAD_WINDOW, field: 'document', op: { type: 'insert', text: level.number } }),
    ]);
    expect(played.done).toBe(1);
  });

  it('needs the whole number selected and copied, not part of it', () => {
    const level = generateLevel(11, 2, 'band-6-8');
    const steps = copyPasteSteps(level, 'linux');
    const played = playSteps(level.desktop, steps, [firstDigit]);
    expect(played.done).toBe(0);
    // Copying part of it after selecting all and then less is another try.
    const partCopy = playSteps(level.desktop, steps, [
      command(NOTEPAD_WINDOW, 'select-all'),
      firstDigit,
      command(NOTEPAD_WINDOW, 'copy'),
    ]);
    expect(partCopy).toMatchObject({ done: 1, wrong: 1 });
  });

  it('counts a paste the calculator refuses as a try', () => {
    const level = generateLevel(11, 2, 'band-6-8');
    const clipboard = createToyClipboard();
    const played = playSteps(
      level.desktop,
      copyPasteSteps(level, 'linux'),
      [
        command(NOTEPAD_WINDOW, 'select-all'),
        command(NOTEPAD_WINDOW, 'copy'),
        () => {
          // Something that is not a number reached the clipboard since.
          clipboard.write({ kind: 'text', text: 'apples' });
          return { type: 'focus-window', windowId: CALCULATOR_WINDOW };
        },
        command(CALCULATOR_WINDOW, 'paste'),
      ],
      { clipboard },
    );
    expect(played).toMatchObject({ done: 2, wrong: 1, rejected: ['command: not-a-number'] });
  });

  it('gives no pointer for a shortcut once the right window is in front', () => {
    const level = generateLevel(11, 3, 'band-9-12');
    const steps = copyPasteSteps(level, 'mac');
    expect(steps[0]?.hint?.(level.desktop)).toBeNull();
    expect(steps[1]?.hint?.(level.desktop)).toEqual({ kind: 'title-bar', windowId: NOTEPAD_WINDOW });
  });
});

// The layout is the design reviewed in the screenshots: the calculator is big enough for the
// band-6-8 keys on the smallest screen, and nothing but the two apps is on the desktop.
describe('copy and paste layout', () => {
  it.each([1, 3])('puts the note and the calculator side by side at difficulty %i', (difficulty) => {
    const level = generateLevel(1, difficulty, 'band-6-8');
    expect(findWindow(level.desktop, NOTEPAD_WINDOW)?.rect).toEqual({ x: 24, y: 24, width: 340, height: 360 });
    expect(findWindow(level.desktop, CALCULATOR_WINDOW)?.rect).toEqual({ x: 388, y: 24, width: 316, height: 540 });
    expect(withDefaults(level.parts)).toEqual({
      icons: [],
      menuBar: difficulty === 1,
      taskStrip: false,
      launcher: [],
      windowControls: [],
      move: false,
      resize: false,
      openMaximized: false,
      systemSound: false,
      // No close button, so Close leaves the menus and shortcuts too.
      hiddenCommands: ['close'],
    });
  });
});
