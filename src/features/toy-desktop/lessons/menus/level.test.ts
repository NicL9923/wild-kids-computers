import { describe, expect, it } from 'vitest';
import { createToyClipboard } from '../../../../app/inputGuards.ts';
import type { Band } from '../../../../core/bands.ts';
import { APP_MENUS } from '../../model/appMenus.ts';
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
