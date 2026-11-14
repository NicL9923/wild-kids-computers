import { describe, expect, it } from 'vitest';
import { createToyClipboard } from '../../../../app/inputGuards.ts';
import type { Band } from '../../../../core/bands.ts';
import { withDefaults } from '../../desktop/parts.ts';
import { reduce, type DesktopAction } from '../../model/desktop.ts';
import { nodeAtPath } from '../../model/fileSystem.ts';
import { isFaultFixed, type Fault } from '../../model/faults.ts';
import { findWindow, type DesktopState } from '../../model/state.ts';
import activity from './activity.ts';
import { DIFFICULTY, generateLevel, SLOTS, type FixItLevel } from './level.ts';
import { faultInstruction, fixSteps } from './steps.ts';
import { strings } from './strings.ts';

/** The apps a window may show. Never settings, which has nothing to fix. */
const FIVE_APPS: readonly string[] = ['notepad', 'picture-viewer', 'file-explorer', 'music-box', 'calculator'];

/** The window a problem moves away from its slot: the one pushed off, or the one laid over another. */
function movedWindow(fault: Fault): string[] {
  if (fault.kind === 'window-off-side') return [fault.windowId];
  if (fault.kind === 'window-behind') return [fault.coveredBy];
  return [];
}

const SEEDS = Array.from({ length: 200 }, (_, index) => index * 7_919 + 11);
const env = () => ({ clipboard: createToyClipboard() });

function rangeOf(band: Band): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error('fix-it is a rounds activity');
  const range = activity.difficulty[band];
  if (range === undefined) throw new Error(`no range for ${band}`);
  return range;
}

/** The fix a child would choose for each problem. */
function fixFor(fault: Fault, state: DesktopState): DesktopAction {
  switch (fault.kind) {
    case 'sound-muted':
      return { type: 'set-muted', muted: false };
    case 'window-off-side': {
      const slot = findWindow(state, fault.windowId)?.rect;
      return { type: 'move-window', windowId: fault.windowId, x: 24, y: slot?.y ?? 24 };
    }
    default:
      return { type: 'activate-window', windowId: fault.windowId };
  }
}

const windowIds = (fault: Fault) =>
  fault.kind === 'sound-muted'
    ? []
    : fault.kind === 'window-behind'
      ? [fault.windowId, fault.coveredBy]
      : [fault.windowId];

/** What makes a round fair: every problem is really there, they use different windows, and each fix works. */
function problems(level: FixItLevel): string[] {
  const found: string[] = [];
  const kinds = level.faults.map((fault) => fault.kind);
  if (new Set(kinds).size !== kinds.length) found.push('a problem repeats');
  const used = level.faults.flatMap(windowIds);
  if (new Set(used).size !== used.length) found.push('two problems share a window');
  for (const fault of level.faults) {
    if (isFaultFixed(level.desktop, fault)) found.push(`${fault.kind} is fixed already`);
  }
  if (level.parts?.systemSound !== kinds.includes('sound-muted')) found.push('the sound button shows for nothing');
  for (const fault of level.faults) {
    if (fault.kind === 'window-off-side' && fault.side !== 'left') found.push('a window off the right side');
  }
  // Every window is one of the five apps, and the ones no problem moved stand in their own slot.
  const moved = new Set(level.faults.flatMap(movedWindow));
  for (const window of level.desktop.windows) {
    if (!FIVE_APPS.includes(window.app.kind)) found.push(`${window.id} is ${window.app.kind}`);
    // Window w1 opened in the first slot, w2 in the second, and so on.
    const slot = SLOTS[Number(window.id.slice(1)) - 1];
    if (slot === undefined) {
      found.push(`${window.id} has no slot`);
      continue;
    }
    if (moved.has(window.id)) continue;
    const { x, y, width, height } = window.rect;
    if (x !== slot.x || y !== slot.y || width !== slot.width || height !== slot.height) {
      found.push(`${window.id} left its slot`);
    }
  }
  const fox = nodeAtPath(level.desktop.fs, 'Fox');
  if (fox?.kind !== 'picture' || fox.pictureId !== 'fox') found.push('no fox picture');
  for (const window of level.desktop.windows) {
    if (window.app.kind === 'picture-viewer' && window.app.fileId !== fox?.id) found.push('the viewer shows no fox');
  }
  // Fix them in order: each fix works and undoes no other.
  let state = level.desktop;
  level.faults.forEach((fault, index) => {
    state = reduce(state, fixFor(fault, state), env()).state;
    if (!isFaultFixed(state, fault)) found.push(`fixing ${fault.kind} did not work`);
    // A window brought to the front counts by focus, which any later fix moves on. Its step is
    // done by then, and the window still sits above the one that covered it.
    for (const earlier of level.faults.slice(0, index).filter((each) => each.kind !== 'window-behind')) {
      if (!isFaultFixed(state, earlier)) found.push(`fixing ${fault.kind} broke ${earlier.kind}`);
    }
  });
  return found;
}

describe.each(['band-6-8', 'band-9-12'] as const)('fix it for %s', (band) => {
  const { min, max } = rangeOf(band);

  it.each([min, max])('is fair and fixable at difficulty %i for every seed', (difficulty) => {
    for (const seed of SEEDS) expect(problems(generateLevel(seed, difficulty, band)), `seed ${seed}`).toEqual([]);
  });
});

describe('fix it difficulty', () => {
  it('brings new problems, a third window, then two or three at once', () => {
    expect(
      DIFFICULTY.map((row) => `${String(row.faults)} of ${row.kinds.join(' ')} in ${String(row.windows)} windows`),
    ).toEqual([
      '1 of sound-muted window-minimized in 2 windows',
      '1 of window-minimized window-behind in 2 windows',
      '1 of sound-muted window-minimized window-behind in 2 windows',
      '1 of window-behind window-off-side in 2 windows',
      '1 of sound-muted window-minimized window-behind window-off-side in 3 windows',
      '2 of sound-muted window-minimized window-behind window-off-side in 3 windows',
      '2 of window-minimized window-behind window-off-side in 3 windows',
      '3 of sound-muted window-minimized window-behind window-off-side in 3 windows',
    ]);
  });

  it('poses every problem of its row across seeds, the row count at a time, in its windows', () => {
    DIFFICULTY.forEach((row, index) => {
      const levels = SEEDS.map((seed) => generateLevel(seed, index + 1, 'band-9-12'));
      expect(new Set(levels.flatMap((level) => level.faults.map((fault) => fault.kind)))).toEqual(new Set(row.kinds));
      expect(levels.every((level) => level.faults.length === row.faults)).toBe(true);
      expect(levels.every((level) => level.desktop.windows.length === row.windows)).toBe(true);
    });
  });

  it('shows the task strip and movable windows with no buttons, and the sound button only when needed', () => {
    // No window buttons: a closed window could not be fixed, and a window off the left edge shows
    // only the right end of its title bar, where buttons would cover the part to grab.
    const { systemSound: _sound, ...parts } = withDefaults(generateLevel(1, 1, 'band-6-8').parts);
    expect(parts).toEqual({
      hiddenCommands: [],
      icons: [],
      menuBar: false,
      taskStrip: true,
      launcher: [],
      windowControls: [],
      move: true,
      resize: false,
      openMaximized: false,
    });
  });

  it('uses every one of the five apps across seeds', () => {
    const apps = new Set(
      SEEDS.flatMap((seed) => generateLevel(seed, 5, 'band-9-12').desktop.windows.map((window) => window.app.kind)),
    );
    expect(apps).toEqual(new Set(FIVE_APPS));
  });

  it('places windows apart, so the one behind another is the only hidden one', () => {
    for (const [index, slot] of SLOTS.entries()) {
      for (const other of SLOTS.slice(index + 1)) {
        const apart =
          slot.x + slot.width <= other.x ||
          other.x + other.width <= slot.x ||
          slot.y + slot.height <= other.y ||
          other.y + other.height <= slot.y;
        expect(apart).toBe(true);
      }
    }
  });
});

function levelWith(kind: Fault['kind']): FixItLevel {
  const found = SEEDS.map((seed) => generateLevel(seed, 5, 'band-9-12')).find(
    (level) => level.faults[0]?.kind === kind,
  );
  if (found === undefined) throw new Error(`no round with ${kind}`);
  return found;
}

/** The window a window problem is about. */
function faultWindow(fault: Fault | undefined): string {
  if (fault === undefined || fault.kind === 'sound-muted') throw new Error('not a window problem');
  return fault.windowId;
}

describe('fix it steps', () => {
  it.each([
    ['sound-muted', strings.soundOff],
    ['window-minimized', strings.minimized],
    ['window-behind', strings.behind],
    ['window-off-side', strings.offSide],
  ] as const)('says what is wrong for %s', (kind, handle) => {
    const [fault] = levelWith(kind).faults;
    if (fault === undefined) throw new Error('no fault');
    expect(faultInstruction(fault)).toBe(handle);
  });

  it('points at the sound button, the task strip, or the title bar', () => {
    const hint = (kind: Fault['kind']) => {
      const level = levelWith(kind);
      return fixSteps(level)[0]?.hint?.(level.desktop);
    };
    expect(hint('sound-muted')).toEqual({ kind: 'key', key: 'system-sound' });
    const minimized = faultWindow(levelWith('window-minimized').faults[0]);
    expect(hint('window-minimized')).toEqual({ kind: 'task', windowId: minimized });
    const behind = faultWindow(levelWith('window-behind').faults[0]);
    expect(hint('window-behind')).toEqual({ kind: 'task', windowId: behind });
    const off = faultWindow(levelWith('window-off-side').faults[0]);
    expect(hint('window-off-side')).toEqual({ kind: 'title-bar', windowId: off });
  });

  it('takes any move of a window off the side as the fix, since a move keeps it all on the desktop', () => {
    const level = levelWith('window-off-side');
    const [fault] = level.faults;
    const [step] = fixSteps(level);
    if (fault?.kind !== 'window-off-side' || step === undefined) throw new Error('no off-side step');
    // The carry puts the window's left edge at 0 or more, wherever the child lets go.
    const back: DesktopAction = { type: 'move-window', windowId: fault.windowId, x: 0, y: 40 };
    const fixed = reduce(level.desktop, back, env());
    expect(step.done(fixed.state, fixed.events)).toBe(true);
    expect(step.wrong?.(fixed, back)).toBe(false);
    // Choosing another window in the strip is no try for a window off the side.
    const other = level.desktop.windows.find((window) => window.id !== fault.windowId)?.id ?? 'none';
    const pick: DesktopAction = { type: 'activate-window', windowId: other };
    expect(step.wrong?.(reduce(level.desktop, pick, env()), pick)).toBe(false);
    // A move by the model alone that leaves it mostly off is still no try.
    const short: DesktopAction = { type: 'move-window', windowId: fault.windowId, x: -200, y: 40 };
    expect(step.wrong?.(reduce(level.desktop, short, env()), short)).toBe(false);
  });

  it('counts another window from the strip as a try for a hidden window, and the right one as the fix', () => {
    const level = levelWith('window-behind');
    const [fault] = level.faults;
    const [step] = fixSteps(level);
    if (fault?.kind !== 'window-behind' || step === undefined) throw new Error('no behind step');
    const other = level.desktop.windows.find((window) => window.id !== fault.windowId && window.id !== fault.coveredBy);
    const pickOther: DesktopAction = { type: 'activate-window', windowId: other?.id ?? fault.coveredBy };
    expect(step.wrong?.(reduce(level.desktop, pickOther, env()), pickOther)).toBe(true);
    const pick: DesktopAction = { type: 'activate-window', windowId: fault.windowId };
    const fixed = reduce(level.desktop, pick, env());
    expect(step.done(fixed.state, fixed.events)).toBe(true);
    expect(step.wrong?.(fixed, pick)).toBe(false);
  });

  it('counts putting a window away as no fix for the sound', () => {
    const level = levelWith('sound-muted');
    const [step] = fixSteps(level);
    if (step === undefined) throw new Error('no step');
    const away: DesktopAction = { type: 'minimize-window', windowId: 'w1' };
    expect(step.wrong?.(reduce(level.desktop, away, env()), away)).toBe(true);
    const look: DesktopAction = { type: 'focus-window', windowId: 'w1' };
    expect(step.wrong?.(reduce(level.desktop, look, env()), look)).toBe(false);
    // Choosing a window in the strip neither fixes the sound nor makes anything worse.
    const pick: DesktopAction = { type: 'activate-window', windowId: 'w1' };
    expect(step.wrong?.(reduce(level.desktop, pick, env()), pick)).toBe(false);
    const louder: DesktopAction = { type: 'set-volume', volume: 60 };
    const fixed = reduce(level.desktop, louder, env());
    expect(step.done(fixed.state, fixed.events)).toBe(true);
  });
});

describe('fix it tries for a minimized window', () => {
  it('counts putting another window away as a try, and looking at one as nothing', () => {
    const level = levelWith('window-minimized');
    const [fault] = level.faults;
    const [step] = fixSteps(level);
    if (fault?.kind !== 'window-minimized' || step === undefined) throw new Error('no minimized step');
    const other = level.desktop.windows.find((window) => window.id !== fault.windowId)?.id ?? 'none';
    const away: DesktopAction = { type: 'minimize-window', windowId: other };
    expect(step.wrong?.(reduce(level.desktop, away, env()), away)).toBe(true);
    const look: DesktopAction = { type: 'focus-window', windowId: other };
    expect(step.wrong?.(reduce(level.desktop, look, env()), look)).toBe(false);
  });
});
