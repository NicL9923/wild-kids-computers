import { describe, expect, it } from 'vitest';
import { createToyClipboard } from '../../../../app/inputGuards.ts';
import type { Band } from '../../../../core/bands.ts';
import { withDefaults } from '../../desktop/parts.ts';
import { APP_MENUS } from '../../model/appMenus.ts';
import { pathId } from '../../model/build.ts';
import { nodeAtPath } from '../../model/fileSystem.ts';
import { reduce, type DesktopAction } from '../../model/desktop.ts';
import { isCommandEnabled } from '../../model/menus.ts';
import type { DesktopState } from '../../model/state.ts';
import activity from './activity.ts';
import { DIFFICULTY, generateLevel, type MenusLevel } from './level.ts';
import { menuSteps, taskInstruction } from './steps.ts';
import { strings } from './strings.ts';

const SEEDS = Array.from({ length: 200 }, (_, index) => index * 7_919 + 11);

function rangeOf(band: Band): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error('menus is a rounds activity');
  const range = activity.difficulty[band];
  if (range === undefined) throw new Error(`no range for ${band}`);
  return range;
}

/**
 * What the child sees before choosing: the window where the menus can reach it, and what the
 * command acts on already there: a number to clear, a note to undo, a picture chosen to open.
 */
function setUpProblems(level: MenusLevel): string[] {
  const found: string[] = [];
  const { desktop } = level;
  const [window] = desktop.windows;
  if (window === undefined) return ['no window'];
  const size = level.app === 'calculator' ? '400x580' : '620x440';
  const { x, y, width, height } = window.rect;
  if (`${String(x)},${String(y)} ${String(width)}x${String(height)}` !== `40,32 ${size}`)
    found.push('the window moved');
  const app = window.app;
  if (app.kind === 'calculator' && app.display !== '42') found.push('the calculator shows no number');
  if (app.kind === 'music-box') {
    if (app.fileId !== pathId(desktop, 'Music/Song')) found.push('the music box shows no tune');
    if (app.tune.steps[6]?.[4] !== true) found.push('no note was added to undo');
  }
  if (app.kind === 'picture-viewer' && app.fileId !== pathId(desktop, 'Pictures/Fox')) found.push('no fox shows');
  const fox = nodeAtPath(desktop.fs, 'Pictures/Fox');
  if (fox?.kind !== 'picture' || fox.pictureId !== 'fox') found.push('the fox has no picture');
  if (app.kind === 'file-explorer') {
    if (app.folderId !== pathId(desktop, 'Pictures')) found.push('the explorer shows another folder');
    if (app.selectedId !== pathId(desktop, 'Pictures/Fox')) found.push('the fox is not chosen');
  }
  return found;
}

/**
 * Runs each command in order the way a menu does, checking it is in its menu and can run at that
 * moment, and that each step is done by it. Returns what went wrong.
 */
function playThrough(level: MenusLevel): string[] {
  const found: string[] = [];
  const env = { clipboard: createToyClipboard() };
  const steps = menuSteps(level);
  let state: DesktopState = level.desktop;
  const window = state.windows[0];
  if (state.windows.length !== 1 || window === undefined) return ['not exactly one window'];
  if (window.app.kind !== level.app) found.push('the window is another app');
  found.push(...setUpProblems(level));
  level.tasks.forEach((task, index) => {
    const menu = APP_MENUS[level.app].find((each) => each.id === task.menu);
    if (menu?.commands.includes(task.command) !== true) found.push(`${task.command} is not in ${task.menu}`);
    if (!isCommandEnabled(state, window.id, task.command, env.clipboard)) found.push(`${task.command} cannot run`);
    const action: DesktopAction = { type: 'command', windowId: window.id, command: task.command };
    const transition = reduce(state, action, env);
    if (steps[index]?.done(transition.state, transition.events) !== true) found.push(`${task.command} is not done`);
    if (steps[index]?.wrong?.(transition, action) !== false) found.push(`${task.command} counts as wrong`);
    state = transition.state;
  });
  return found;
}

describe.each(['band-6-8', 'band-9-12'] as const)('menus for %s', (band) => {
  const { min, max } = rangeOf(band);

  it.each([min, max])('every command can be found and run at difficulty %i for every seed', (difficulty) => {
    for (const seed of SEEDS) expect(playThrough(generateLevel(seed, difficulty, band)), `seed ${seed}`).toEqual([]);
  });
});

describe('menus difficulty', () => {
  it('changes the apps, then hides the menu name, then asks for two commands', () => {
    const table = DIFFICULTY.map(
      (row) => `${row.named ? 'named' : 'unnamed'}: ${row.cases.map((each) => each.id).join(' ')}`,
    );
    expect(table).toEqual([
      'named: calculator-clear viewer-open',
      'named: calculator-clear viewer-open notepad-select-all notepad-save-as notepad-open',
      'named: notepad-select-all notepad-save-as notepad-open music-undo music-save-as explorer-open',
      'unnamed: calculator-clear viewer-open notepad-select-all notepad-save-as notepad-open music-undo music-save-as explorer-open',
      'unnamed: notepad-select-all notepad-save-as notepad-open music-undo music-save-as explorer-open',
      'named: notepad-select-all-save-as music-undo-save-as notepad-select-all-open',
      'unnamed: notepad-select-all-save-as music-undo-save-as notepad-select-all-open',
    ]);
  });

  it('reaches every case of a difficulty across seeds, and asks the table row for that difficulty', () => {
    DIFFICULTY.forEach((row, index) => {
      const levels = SEEDS.map((seed) => generateLevel(seed, index + 1, 'band-9-12'));
      expect(new Set(levels.map((level) => level.caseId))).toEqual(new Set(row.cases.map((each) => each.id)));
      expect(levels.every((level) => level.named === row.named)).toBe(true);
    });
  });

  it('keeps a difficulty outside the table on its nearest row', () => {
    expect(generateLevel(1, 0, 'band-6-8').caseId).toBe(generateLevel(1, 1, 'band-6-8').caseId);
    expect(generateLevel(1, 9, 'band-9-12').named).toBe(false);
    expect(generateLevel(1, 9, 'band-9-12').tasks).toHaveLength(2);
  });
});

describe('menus steps', () => {
  it('says the menu and the command when the menu is named, and only the command when not', () => {
    const task = { command: 'clear', menu: 'edit' } as const;
    expect(taskInstruction(task, true, true).map((handle) => handle.id)).toEqual([
      strings.inMenu.id,
      'toy-desktop.menuEdit',
      strings.choose.id,
      'toy-desktop.clear',
    ]);
    expect(taskInstruction(task, true, false)[0]).toBe(strings.nowInMenu);
    expect(taskInstruction(task, false, true).map((handle) => handle.id)).toEqual([
      strings.findCommand.id,
      'toy-desktop.clear',
    ]);
    expect(taskInstruction(task, false, false)[0]).toBe(strings.nowFind);
  });

  it('counts another command as a try and points at the menu that holds the right one', () => {
    const level = SEEDS.map((seed) => generateLevel(seed, 3, 'band-6-8')).find(
      (each) => each.caseId === 'notepad-open',
    );
    if (level === undefined) throw new Error('no notepad round');
    const [step] = menuSteps(level);
    if (step === undefined) throw new Error('no step');
    const env = { clipboard: createToyClipboard() };
    const other: DesktopAction = { type: 'command', windowId: 'w1', command: 'select-all' };
    const transition = reduce(level.desktop, other, env);
    expect(step.wrong?.(transition, other)).toBe(true);
    expect(step.done(transition.state, transition.events)).toBe(false);
    expect(step.hint?.(level.desktop)).toEqual({ kind: 'menu', menu: 'file' });
    // Running the right command earlier does not count again: the check needs this action's event.
    expect(step.done(transition.state, [])).toBe(false);
  });
});

describe('menus cases', () => {
  it('asks for commands the app buttons do not offer, each in the menu that holds it', () => {
    const cases = new Map(DIFFICULTY.flatMap((row) => row.cases).map((each) => [each.id, each]));
    const asked = [...cases.values()].map(
      (each) => `${each.app}: ${each.tasks.map((task) => `${task.command} in ${task.menu}`).join(', then ')}`,
    );
    expect(asked).toEqual([
      'calculator: clear in edit',
      'picture-viewer: open in file',
      'notepad: select-all in edit',
      'notepad: save-as in file',
      'notepad: open in file',
      'music-box: undo in edit',
      'music-box: save-as in file',
      'file-explorer: open in file',
      'notepad: select-all in edit, then save-as in file',
      'music-box: undo in edit, then save-as in file',
      'notepad: select-all in edit, then open in file',
    ]);
  });

  it('shows the menu bar and one still window with no buttons', () => {
    // No window buttons: closing the window would leave no menus to look in.
    expect(withDefaults(generateLevel(1, 1, 'band-6-8').parts)).toEqual({
      // No close button, so Close leaves the menus and shortcuts too.
      hiddenCommands: ['close'],
      icons: [],
      menuBar: true,
      taskStrip: false,
      launcher: [],
      windowControls: [],
      move: false,
      resize: false,
      openMaximized: false,
      systemSound: false,
    });
  });

  it('says "open the menu" first and "now open the menu" for the second command', () => {
    const level = SEEDS.map((seed) => generateLevel(seed, 6, 'band-9-12'))[0];
    if (level === undefined) throw new Error('no level');
    const [first, second] = menuSteps(level);
    const ids = (step: typeof first) =>
      Array.isArray(step?.instruction) ? step.instruction.map((handle) => handle.id) : [];
    expect(ids(first)[0]).toBe(strings.inMenu.id);
    expect(ids(second)[0]).toBe(strings.nowInMenu.id);
  });
});
