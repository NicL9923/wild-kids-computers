import { describe, expect, it } from 'vitest';
import { createToyClipboard } from '../../../../app/inputGuards.ts';
import type { Band } from '../../../../core/bands.ts';
import { withDefaults } from '../../desktop/parts.ts';
import { reduceAll, type DesktopAction } from '../../model/desktop.ts';
import { nodeAtPath } from '../../model/fileSystem.ts';
import { windowsOf } from '../../model/goals.ts';
import type { DesktopState } from '../../model/state.ts';
import { LESSON_DESKTOP_SIZE, type LessonStep } from '../harness/lesson.ts';
import activity from './activity.ts';
import { APPS, generateLevel, type SwitchLevel } from './level.ts';
import { switchSteps } from './steps.ts';
import { strings } from './strings.ts';

const SEEDS = Array.from({ length: 200 }, (_, index) => index * 7_919 + 11);
const env = () => ({ clipboard: createToyClipboard() });

function rangeOf(band: Band): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error('switch-windows is a rounds activity');
  const range = activity.difficulty[band];
  if (range === undefined) throw new Error(`no range for ${band}`);
  return range;
}

/** Runs actions one at a time, the way the harness does, and returns how many steps got done. */
function play(level: SwitchLevel, actions: readonly DesktopAction[]): { state: DesktopState; done: number } {
  const steps: LessonStep[] = switchSteps(level);
  let state = level.desktop;
  let done = 0;
  for (const action of actions) {
    const transition = reduceAll(state, [action], env());
    state = transition.state;
    while (done < steps.length && steps[done]?.done(state, transition.events) === true) done += 1;
  }
  return { state, done };
}

const targetId = (level: SwitchLevel) => level.targetWindow;

/** How far each window steps from the one behind it, at least, so every title bar shows. */
const STEP_APART = 48;

/** What makes a round fair: the target is open once, hidden the way the level says, and not in front. */
function problems(level: SwitchLevel): string[] {
  const found: string[] = [];
  const { desktop, target, hiding } = level;
  const targets = windowsOf(desktop, target);
  if (targets.length !== 1) return ['the target is not open exactly once'];
  if (targets[0]?.id !== level.targetWindow) found.push('the target window id is another window');
  level.desktop.windows.forEach((each, index) => {
    const before = level.desktop.windows[index - 1];
    if (before === undefined) return;
    if (each.rect.x - before.rect.x < STEP_APART || each.rect.y - before.rect.y < STEP_APART) {
      found.push(`${each.id} hides the title bar of ${before.id}`);
    }
  });
  const fox = nodeAtPath(level.desktop.fs, 'Fox');
  if (fox?.kind !== 'picture' || fox.pictureId !== 'fox') found.push('no fox picture');
  for (const viewer of windowsOf(level.desktop, 'picture-viewer')) {
    if (viewer.app.kind === 'picture-viewer' && viewer.app.fileId !== fox?.id) found.push('the viewer shows no fox');
  }
  if (new Set(level.apps).size !== level.apps.length) found.push('two windows of one app');
  if (desktop.windows.map((window) => window.app.kind).join() !== level.apps.join()) found.push('apps out of order');
  const window = targets[0];
  if (window === undefined || desktop.focusedWindowId === window.id) found.push('the target starts in front');
  for (const each of desktop.windows) {
    const { x, y, width, height } = each.rect;
    if (x < 0 || y < 0 || x + width > LESSON_DESKTOP_SIZE.width || y + height > LESSON_DESKTOP_SIZE.height) {
      found.push(`${each.id} leaves the desktop`);
    }
  }
  const minimized = desktop.windows.filter((each) => each.minimized).map((each) => each.app.kind);
  const maximized = desktop.windows.filter((each) => each.maximized).map((each) => each.app.kind);
  if (minimized.join() !== (hiding === 'minimized' ? target : '')) found.push('the wrong windows are minimized');
  const front = level.apps.at(-1) ?? '';
  if (maximized.join() !== (hiding === 'under-maximized' ? front : '')) found.push('the wrong windows fill the screen');
  return found;
}

describe.each(['band-6-8', 'band-9-12'] as const)('switch windows for %s', (band) => {
  const { min, max } = rangeOf(band);

  it.each([min, max])('is fair and solvable from the task strip at difficulty %i for every seed', (difficulty) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, band);
      expect(problems(level), `seed ${seed}`).toEqual([]);
      const windowId = targetId(level);
      const { done } = play(level, [
        { type: 'activate-window', windowId },
        { type: 'maximize-window', windowId },
        { type: 'minimize-window', windowId },
      ]);
      expect(done, `seed ${seed}`).toBe(1 + level.finish.length);
    }
  });

  it('names every app as the target across seeds', () => {
    const targets = new Set(SEEDS.map((seed) => generateLevel(seed, max, band).target));
    expect([...targets].toSorted()).toEqual([...APPS].toSorted());
  });
});

describe('switch windows difficulty', () => {
  it('changes one thing at each step: windows, then how the target hides, then a last step', () => {
    const table = Array.from({ length: 7 }, (_, index) => {
      const level = generateLevel(SEEDS[0] ?? 1, index + 1, 'band-9-12');
      return [level.apps.length, level.hiding, level.finish.join('+')].join(' ');
    });
    expect(table).toEqual([
      '2 behind maximize',
      '3 behind maximize',
      '3 minimized maximize',
      '4 minimized maximize',
      '4 minimized maximize+minimize',
      '4 under-maximized maximize+minimize',
      '5 under-maximized maximize+minimize',
    ]);
  });

  it('shows only the task strip and the two window buttons, never close', () => {
    // No close button: a closed window could never be found. Windows move, so a child can push
    // one aside to look behind it.
    expect(withDefaults(generateLevel(1, 3, 'band-6-8').parts)).toEqual({
      // No close button, so Close leaves the menus and shortcuts too.
      hiddenCommands: ['close'],
      icons: [],
      menuBar: false,
      taskStrip: true,
      launcher: [],
      windowControls: ['minimize', 'maximize'],
      move: true,
      resize: false,
      openMaximized: false,
      systemSound: false,
    });
  });

  it('hides the target at every depth of the stack but the front across seeds', () => {
    const depths = new Set(
      SEEDS.map((seed) => generateLevel(seed, 7, 'band-9-12')).map((level) => level.apps.indexOf(level.target)),
    );
    expect([...depths].toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });
});

describe('switch windows steps', () => {
  it('finds a window under one that fills the screen by putting the front one away', () => {
    const level = generateLevel(SEEDS[1] ?? 1, 7, 'band-9-12');
    const front = level.desktop.windows.at(-1)?.id ?? 'none';
    // Putting the front window away shows the one behind it, which is the target only sometimes.
    const { state } = play(level, [{ type: 'minimize-window', windowId: front }]);
    const shown = state.focusedWindowId === targetId(level);
    expect(play(level, [{ type: 'minimize-window', windowId: front }]).done).toBe(shown ? 1 : 0);
    expect(play(level, [{ type: 'focus-window', windowId: targetId(level) }]).done).toBe(1);
  });

  it('does not count another window coming forward, or the target still minimized', () => {
    const level = generateLevel(SEEDS[2] ?? 1, 3, 'band-6-8');
    const other = level.desktop.windows.find((each) => each.id !== targetId(level))?.id ?? 'none';
    expect(play(level, [{ type: 'activate-window', windowId: other }]).done).toBe(0);
    expect(level.hiding).toBe('minimized');
    expect(play(level, [{ type: 'maximize-window', windowId: other }]).done).toBe(0);
  });

  it('counts only a task strip pick of another window as a wrong find, and points at the right one', () => {
    const level = generateLevel(SEEDS[2] ?? 1, 3, 'band-6-8');
    const [find] = switchSteps(level);
    if (find === undefined) throw new Error('no find step');
    const other = level.desktop.windows.find((each) => each.id !== targetId(level))?.id ?? 'none';
    const pick: DesktopAction = { type: 'activate-window', windowId: other };
    const look: DesktopAction = { type: 'focus-window', windowId: other };
    expect(find.wrong?.(reduceAll(level.desktop, [pick], env()), pick)).toBe(true);
    expect(find.wrong?.(reduceAll(level.desktop, [look], env()), look)).toBe(false);
    const right: DesktopAction = { type: 'activate-window', windowId: targetId(level) };
    expect(find.wrong?.(reduceAll(level.desktop, [right], env()), right)).toBe(false);
    expect(find.hint?.(level.desktop)).toEqual({ kind: 'task', windowId: targetId(level) });
    expect(find.nudge).toBe(strings.lookAtStrip);
  });

  it.each([
    ['notepad', strings.findNotepad],
    ['picture-viewer', strings.findPictureViewer],
    ['file-explorer', strings.findFileExplorer],
    ['music-box', strings.findMusicBox],
    ['calculator', strings.findCalculator],
  ] as const)('names the %s window to find', (app, handle) => {
    const level = SEEDS.map((seed) => generateLevel(seed, 5, 'band-9-12')).find((each) => each.target === app);
    if (level === undefined) throw new Error(`no round asks for ${app}`);
    expect(switchSteps(level)[0]?.instruction).toBe(handle);
  });

  it('asks for the maximize and minimize buttons, and counts the other one as a try', () => {
    const level = generateLevel(SEEDS[4] ?? 1, 5, 'band-6-8');
    const windowId = targetId(level);
    const [, maximize, minimize] = switchSteps(level);
    if (maximize === undefined || minimize === undefined) throw new Error('three steps');
    expect(maximize.instruction).toBe(strings.maximize);
    expect(minimize.instruction).toBe(strings.minimize);
    const shown = reduceAll(level.desktop, [{ type: 'activate-window', windowId }], env()).state;
    const away: DesktopAction = { type: 'minimize-window', windowId };
    expect(maximize.wrong?.(reduceAll(shown, [away], env()), away)).toBe(true);
    const big = reduceAll(shown, [{ type: 'maximize-window', windowId }], env()).state;
    const back: DesktopAction = { type: 'unmaximize-window', windowId };
    expect(minimize.wrong?.(reduceAll(big, [back], env()), back)).toBe(true);
    expect(maximize.hint?.(shown)).toEqual({ kind: 'window-control', windowId, control: 'maximize' });
    expect(minimize.hint?.(big)).toEqual({ kind: 'window-control', windowId, control: 'minimize' });
    // Another window coming forward, as a keyboard user tabs through it, is no try.
    const other = level.desktop.windows.find((each) => each.id !== windowId)?.id ?? 'none';
    const look: DesktopAction = { type: 'focus-window', windowId: other };
    expect(maximize.wrong?.(reduceAll(shown, [look], env()), look)).toBe(false);
  });
});
