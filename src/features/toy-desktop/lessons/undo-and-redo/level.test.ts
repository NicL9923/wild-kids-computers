import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import type { OsFamily } from '../../../../core/platform/bridge.ts';
import { withDefaults } from '../../desktop/parts.ts';
import type { DesktopAction } from '../../model/desktop.ts';
import type { CommandId } from '../../model/commands.ts';
import { findWindow, type DesktopState } from '../../model/state.ts';
import { LESSON_DESKTOP_SIZE } from '../harness/lesson.ts';
import { playSteps } from '../harness/playSteps.ts';
import activity from './activity.ts';
import { TUNE_NOTES } from '../../model/apps/tune.ts';
import { DOT_ROWS, DOT_STEPS, generateLevel, type UndoRedoLevel } from './level.ts';
import { undoRedoSay, undoRedoSteps } from './steps.ts';
import { strings } from './strings.ts';

const ICON_ROOM = 320;
const SEEDS = Array.from({ length: 200 }, (_, index) => index * 7_919 + 11);

function rangeOf(band: Band): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error('undo-and-redo is a rounds activity');
  const range = activity.difficulty[band];
  if (range === undefined) throw new Error(`no range for ${band}`);
  return range;
}

function noteText(state: DesktopState, windowId: string | undefined): string | null {
  const app = windowId === undefined ? undefined : findWindow(state, windowId)?.app;
  return app?.kind === 'notepad' ? app.editor.text : null;
}

function dotOn(state: DesktopState, level: UndoRedoLevel): boolean | null {
  const windowId = level.windows['music-box'];
  const app = windowId === undefined ? undefined : findWindow(state, windowId)?.app;
  if (app?.kind !== 'music-box' || level.dot === undefined) return null;
  return app.tune.steps[level.dot.step]?.[level.dot.note] === true;
}

/** What makes a round fair: each app shows its last change, and that change is the next undo. */
function problems(level: UndoRedoLevel): string[] {
  const found: string[] = [];
  const { desktop } = level;
  if (desktop.windows.length !== level.apps.length) found.push('the windows are not the round’s apps');
  for (const app of level.apps) {
    const window = findWindow(desktop, level.windows[app] ?? '');
    if (window?.app.kind !== app) found.push(`${app} is not open`);
    else if (window.app.kind === 'notepad') {
      if (window.app.editor.text !== level.sentence?.after) found.push('the note does not show the last word');
      if (window.app.editor.undo.length !== 1) found.push('the note has more than the last word to undo');
    } else if (window.app.kind === 'music-box') {
      if (dotOn(desktop, level) !== true) found.push('the music box does not show the dot');
      if (window.app.undo.length !== 1) found.push('the music box has more than the dot to undo');
      if ((level.dot?.step ?? DOT_STEPS) >= DOT_STEPS) found.push('the dot is past the steps every screen shows');
      // Rows go from the highest note at the top; only the top rows show on every screen.
      if ((level.dot?.note ?? 0) < TUNE_NOTES - DOT_ROWS) found.push('the dot is below the rows every screen shows');
    }
    if (window !== undefined) {
      const { x, y, width, height } = window.rect;
      if (x < 0 || y < 0 || y + height > LESSON_DESKTOP_SIZE.height) found.push(`${app} leaves the desktop`);
      if (x + width > LESSON_DESKTOP_SIZE.width - ICON_ROOM) found.push(`${app} reaches the right edge`);
    }
  }
  const [first, second] = desktop.windows.map((window) => window.rect);
  if (
    first !== undefined &&
    second !== undefined &&
    first.y + first.height > second.y &&
    second.y + second.height > first.y
  ) {
    found.push('the windows overlap');
  }
  if (desktop.focusedWindowId !== level.windows[level.apps[0] ?? 'notepad'])
    found.push('the first app is not in front');
  return found;
}

const command = (windowId: string | undefined, run: CommandId) => (): DesktopAction => ({
  type: 'command',
  windowId: windowId ?? 'none',
  command: run,
});

/** What a child does in each app: click it, undo, redo. */
function childActions(level: UndoRedoLevel): (() => DesktopAction)[] {
  return level.apps.flatMap((app) => {
    const windowId = level.windows[app] ?? 'none';
    return [() => ({ type: 'focus-window', windowId }) as const, command(windowId, 'undo'), command(windowId, 'redo')];
  });
}

describe.each(['band-6-8', 'band-9-12'] as const)('undo and redo for %s', (band) => {
  const { min, max } = rangeOf(band);

  it.each([min, max])('is fair and solvable at difficulty %i for every seed', (difficulty) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, band);
      expect(problems(level), `seed ${seed}`).toEqual([]);
      const steps = undoRedoSteps(level, 'linux');
      const played = playSteps(level.desktop, steps, childActions(level));
      expect(played, `seed ${seed}`).toMatchObject({ done: steps.length, wrong: 0, rejected: [] });
    }
  });
});

describe('undo and redo difficulty', () => {
  // The design: the apps of each round, in order, and whether the menu or the keys run the commands.
  it.each([
    [1, ['notepad'], 'menu'],
    [2, ['music-box'], 'menu'],
    [3, ['notepad', 'music-box'], 'menu'],
    [4, ['notepad'], 'keys'],
    [5, ['music-box'], 'keys'],
    [6, ['notepad', 'music-box'], 'keys'],
  ] as const)('at %i undoes in %j by %s', (difficulty, apps, route) => {
    const level = generateLevel(9, difficulty, 'band-9-12');
    expect(level.apps).toEqual(apps);
    expect(level.route).toBe(route);
    expect(withDefaults(level.parts).menuBar).toBe(route === 'menu');
    expect(undoRedoSteps(level, 'mac')).toHaveLength(apps.length * 2);
  });

  it('keeps a difficulty outside the range at the nearest end', () => {
    expect(generateLevel(5, 0, 'band-6-8')).toEqual(generateLevel(5, 1, 'band-6-8'));
    expect(generateLevel(5, 9, 'band-9-12')).toEqual(generateLevel(5, 6, 'band-9-12'));
  });

  it('hides Clear, which would undo the whole tune at once', () => {
    expect(withDefaults(generateLevel(1, 2, 'band-6-8').parts).hiddenCommands).toEqual(['clear']);
  });
});

describe('undo and redo steps', () => {
  it('takes the last word off and puts it back', () => {
    const level = generateLevel(21, 1, 'band-6-8');
    const windowId = level.windows.notepad;
    const steps = undoRedoSteps(level, 'linux');
    const undone = playSteps(level.desktop, steps, [command(windowId, 'undo')]);
    expect(noteText(undone.state, windowId)).toBe(level.sentence?.before);
    const redone = playSteps(undone.state, steps.slice(1), [command(windowId, 'redo')]);
    expect(noteText(redone.state, windowId)).toBe(level.sentence?.after);
  });

  it('takes the last dot off and puts it back', () => {
    const level = generateLevel(21, 2, 'band-6-8');
    const windowId = level.windows['music-box'];
    const steps = undoRedoSteps(level, 'linux');
    const undone = playSteps(level.desktop, steps, [command(windowId, 'undo')]);
    expect(dotOn(undone.state, level)).toBe(false);
    const redone = playSteps(undone.state, steps.slice(1), [command(windowId, 'redo')]);
    expect(dotOn(redone.state, level)).toBe(true);
  });

  it('counts an undo in the other app as a try, and points at the right window', () => {
    const level = generateLevel(21, 3, 'band-6-8');
    const notepad = level.windows.notepad;
    const musicBox = level.windows['music-box'];
    if (notepad === undefined || musicBox === undefined) throw new Error('difficulty 3 has both apps');
    const steps = undoRedoSteps(level, 'linux');
    const played = playSteps(level.desktop, steps, [
      () => ({ type: 'focus-window', windowId: musicBox }),
      command(musicBox, 'undo'),
      command(musicBox, 'redo'),
    ]);
    expect(played).toMatchObject({ done: 0, wrong: 2, rejected: [] });
    expect(played.hints).toEqual([{ kind: 'title-bar', windowId: notepad }]);
    expect(steps[0]?.hint?.(level.desktop)).toEqual({ kind: 'menu', menu: 'edit' });
  });

  it('asks to click the music box when it comes second', () => {
    const level = generateLevel(21, 6, 'band-9-12');
    expect(undoRedoSteps(level, 'windows').map((step) => step.instruction)).toEqual([
      strings.undoWordCtrl,
      strings.redoCtrl,
      strings.undoDotNextCtrl,
      strings.redoCtrl,
    ]);
    // With shortcuts there is no menu to point at once the right window is in front.
    expect(undoRedoSteps(level, 'windows')[0]?.hint?.(level.desktop)).toBeNull();
  });

  it.each([
    ['menu', 'mac', strings.redo],
    ['keys', 'linux', strings.redoCtrl],
    ['keys', 'windows', strings.redoCtrl],
    ['keys', 'mac', strings.redoCmd],
  ] as const)('says the %s way to redo on %s', (route, os: OsFamily, handle) => {
    expect(undoRedoSay('redo', route, os)).toBe(handle);
  });
});
