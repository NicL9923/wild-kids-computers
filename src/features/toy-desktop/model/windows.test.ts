import { describe, expect, it } from 'vitest';
import { createToyClipboard } from '../../../app/inputGuards.ts';
import { buildDesktop, note, pathId } from './build.ts';
import { reduce, reduceAll, windowFrame, type DesktopAction, type Transition } from './desktop.ts';
import type { DesktopEvent } from './events.ts';
import {
  CASCADE_STEP,
  MIN_DESKTOP_SIZE,
  MIN_VISIBLE_TITLE_BAR,
  MIN_WINDOW_SIZE,
  TITLE_BAR_HEIGHT,
} from './geometry.ts';
import { MAX_WINDOWS, type DesktopState, type WindowState } from './state.ts';

const env = () => ({ clipboard: createToyClipboard() });

function act(state: DesktopState, ...actions: DesktopAction[]): Transition {
  return reduceAll(state, actions, env());
}

function win(state: DesktopState, index: number): WindowState {
  const window = state.windows[index];
  if (window === undefined) throw new Error(`no window ${index}`);
  return window;
}

/** Three windows, opened in order: notepad (w1), calculator (w2), music box (w3), music box in front. */
function three(): DesktopState {
  return buildDesktop({ windows: [{ app: 'notepad' }, { app: 'calculator' }, { app: 'music-box' }] });
}

const ids = (state: DesktopState) => state.windows.map((window) => window.id);

describe('opening windows', () => {
  it('opens an app in front with focus', () => {
    const { state, events } = act(buildDesktop(), { type: 'open-app', app: 'calculator' });
    expect(state.windows).toHaveLength(1);
    expect(state.focusedWindowId).toBe('w1');
    expect(events).toEqual([
      { type: 'window-opened', windowId: 'w1', app: 'calculator' },
      { type: 'window-focused', windowId: 'w1' },
    ]);
  });

  it('cascades several windows', () => {
    const state = three();
    const [a, b, c] = state.windows.map((window) => window.rect);
    expect(b?.x).toBe((a?.x ?? 0) + CASCADE_STEP);
    expect(c?.y).toBe((b?.y ?? 0) + CASCADE_STEP);
  });

  it(`refuses a window past ${MAX_WINDOWS}`, () => {
    const full = buildDesktop({ windows: Array.from({ length: MAX_WINDOWS }, () => ({ app: 'calculator' as const })) });
    const { state, events } = act(full, { type: 'open-app', app: 'notepad' });
    expect(state).toBe(full);
    expect(events).toEqual([{ type: 'rejected', action: 'open-app', reason: 'too-many-windows' }]);
  });

  it('refuses an action for a window that is not there', () => {
    expect(act(buildDesktop(), { type: 'close-window', windowId: 'w9' }).events).toEqual([
      { type: 'rejected', action: 'close-window', reason: 'no-window' },
    ]);
  });
});

describe('closing windows', () => {
  it('closing the focused window focuses the next one in front', () => {
    const { state, events } = act(three(), { type: 'close-window', windowId: 'w3' });
    expect(ids(state)).toEqual(['w1', 'w2']);
    expect(state.focusedWindowId).toBe('w2');
    expect(events).toEqual([
      { type: 'window-closed', windowId: 'w3', app: 'music-box', unsavedChanges: false },
      { type: 'window-focused', windowId: 'w2' },
    ]);
  });

  it('skips a minimized window when choosing the next focus', () => {
    const start = buildDesktop({
      windows: [{ app: 'notepad' }, { app: 'calculator', minimized: true }, { app: 'music-box' }],
    });
    expect(act(start, { type: 'close-window', windowId: 'w3' }).state.focusedWindowId).toBe('w1');
  });

  it('closing a window behind keeps the focus where it is', () => {
    const { state, events } = act(three(), { type: 'close-window', windowId: 'w1' });
    expect(state.focusedWindowId).toBe('w3');
    expect(events.map((event) => event.type)).toEqual(['window-closed']);
  });

  it('closing the last window leaves nothing focused', () => {
    const one = buildDesktop({ windows: [{ app: 'notepad' }] });
    expect(act(one, { type: 'close-window', windowId: 'w1' }).state.focusedWindowId).toBeNull();
  });

  it('says when a closed window had unsaved changes', () => {
    const typed = buildDesktop({ windows: [{ app: 'notepad', text: 'my story' }] });
    expect(act(typed, { type: 'close-window', windowId: 'w1' }).events[0]).toMatchObject({ unsavedChanges: true });
  });
});

describe('focus and order', () => {
  it('focusing a window brings it to the front', () => {
    const { state, events } = act(three(), { type: 'focus-window', windowId: 'w1' });
    expect(ids(state)).toEqual(['w2', 'w3', 'w1']);
    expect(events).toEqual([{ type: 'window-focused', windowId: 'w1' }]);
  });

  it('focusing the focused window reports nothing', () => {
    expect(act(three(), { type: 'focus-window', windowId: 'w3' }).events).toEqual([]);
  });

  it('refuses to focus a minimized window, which the task strip restores instead', () => {
    const start = buildDesktop({ windows: [{ app: 'notepad', minimized: true }, { app: 'calculator' }] });
    expect(act(start, { type: 'focus-window', windowId: 'w1' }).events).toEqual([
      { type: 'rejected', action: 'focus-window', reason: 'minimized' },
    ]);
  });

  it('switches through every window with the keyboard, minimized ones too', () => {
    let state = buildDesktop({
      windows: [{ app: 'notepad', minimized: true }, { app: 'calculator' }, { app: 'music-box' }],
    });
    const seen: (string | null)[] = [];
    for (let index = 0; index < 3; index += 1) {
      state = act(state, { type: 'focus-next-window' }).state;
      seen.push(state.focusedWindowId);
    }
    expect(seen).toEqual(['w1', 'w2', 'w3']);
    expect(win(state, 0).minimized).toBe(false);
  });

  it('switching with one visible window does nothing', () => {
    const one = buildDesktop({ windows: [{ app: 'notepad' }] });
    expect(act(one, { type: 'focus-next-window' })).toEqual({ state: one, events: [] });
    expect(act(buildDesktop(), { type: 'focus-next-window' }).events).toEqual([]);
  });

  it('switching restores a lone minimized window', () => {
    const one = buildDesktop({ windows: [{ app: 'notepad', minimized: true }] });
    expect(act(one, { type: 'focus-next-window' }).state.focusedWindowId).toBe('w1');
  });
});

/** One notepad at a known place and size. */
const placed = () =>
  buildDesktop({ windows: [{ app: 'notepad', at: { x: 100, y: 100 }, size: { width: 500, height: 300 } }] });

describe('moving and resizing', () => {
  it('moves a window and brings it forward', () => {
    const start = buildDesktop({ windows: [{ app: 'notepad' }, { app: 'calculator' }] });
    const { state, events } = act(start, { type: 'move-window', windowId: 'w1', x: 300, y: 200 });
    expect(win(state, 1)).toMatchObject({ id: 'w1', rect: { x: 300, y: 200 } });
    expect(events.map((event) => event.type)).toEqual(['window-moved', 'window-focused']);
  });

  it('keeps the title bar on the desktop when moved far away', () => {
    const { state } = act(placed(), { type: 'move-window', windowId: 'w1', x: -9000, y: 9000 });
    expect(win(state, 0).rect).toMatchObject({
      x: MIN_VISIBLE_TITLE_BAR - 500,
      y: state.size.height - TITLE_BAR_HEIGHT,
    });
  });

  it('reports no move when the window stays put', () => {
    expect(act(placed(), { type: 'move-window', windowId: 'w1', x: 100, y: 100 }).events).toEqual([]);
  });

  it('restores a maximized window when it is moved', () => {
    const start = buildDesktop({ windows: [{ app: 'notepad', maximized: true }] });
    const { state, events } = act(start, { type: 'move-window', windowId: 'w1', x: 200, y: 150 });
    expect(win(state, 0)).toMatchObject({ maximized: false, rect: { x: 200, y: 150 } });
    expect(events[0]).toEqual({ type: 'window-unmaximized', windowId: 'w1' });
  });

  it('resizes from the bottom right corner', () => {
    const { state, events } = act(placed(), { type: 'resize-window', windowId: 'w1', width: 640, height: 480 });
    expect(win(state, 0).rect).toEqual({ x: 100, y: 100, width: 640, height: 480 });
    expect(events).toEqual([{ type: 'window-resized', windowId: 'w1', rect: win(state, 0).rect, clamped: false }]);
  });

  it('clamps a resize below the minimum and says so', () => {
    const { state, events } = act(placed(), { type: 'resize-window', windowId: 'w1', width: 10, height: 10 });
    expect(win(state, 0).rect).toMatchObject({ width: MIN_WINDOW_SIZE.width, height: MIN_WINDOW_SIZE.height });
    expect(events[0]).toMatchObject({ type: 'window-resized', clamped: true });
  });

  it('says a resize was clamped even when the window was already at the minimum', () => {
    const small = act(placed(), { type: 'resize-window', windowId: 'w1', width: 1, height: 1 }).state;
    const { events } = act(small, { type: 'resize-window', windowId: 'w1', width: 1, height: 1 });
    expect(events[0]).toMatchObject({ type: 'window-resized', clamped: true });
  });

  it('clamps a resize to the desktop', () => {
    const { state } = act(placed(), { type: 'resize-window', windowId: 'w1', width: 9000, height: 9000 });
    expect(win(state, 0).rect).toMatchObject({ width: state.size.width, height: state.size.height });
  });

  it('slides a window hanging off the left back so a shrink keeps its title bar reachable', () => {
    const hanging = act(placed(), { type: 'move-window', windowId: 'w1', x: -9000, y: 0 }).state;
    const { state } = act(hanging, { type: 'resize-window', windowId: 'w1', width: 240, height: 200 });
    expect(win(state, 0).rect.x + win(state, 0).rect.width).toBe(MIN_VISIBLE_TITLE_BAR);
  });

  it.each([
    ['maximized', { maximized: true }, 'resize-window', 'maximized'],
    ['minimized', { minimized: true }, 'resize-window', 'minimized'],
    ['minimized', { minimized: true }, 'move-window', 'minimized'],
  ] as const)('refuses to change a %s window', (_label, flags, type, reason) => {
    const start = buildDesktop({ windows: [{ app: 'notepad', ...flags }, { app: 'calculator' }] });
    const action: DesktopAction =
      type === 'resize-window'
        ? { type, windowId: 'w1', width: 600, height: 400 }
        : { type, windowId: 'w1', x: 10, y: 10 };
    expect(act(start, action).events).toEqual([{ type: 'rejected', action: type, reason }]);
  });

  it('refuses a size that is not a number', () => {
    expect(act(placed(), { type: 'resize-window', windowId: 'w1', width: Number.NaN, height: 300 }).events).toEqual([
      { type: 'rejected', action: 'resize-window', reason: 'not-an-option' },
    ]);
  });

  it('keeps every title bar reachable through any moves and resizes, on any desktop size', () => {
    // A small fixed generator, so the walk is the same on every run.
    let seed = 7;
    const next = (range: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return (seed / 2147483648) * range * 2 - range;
    };
    let state = buildDesktop({ windows: [{ app: 'notepad' }, { app: 'file-explorer' }] });
    for (let step = 0; step < 400; step += 1) {
      const windowId = step % 2 === 0 ? 'w1' : 'w2';
      const choice = step % 3;
      const action: DesktopAction =
        choice === 0
          ? { type: 'move-window', windowId, x: next(4000), y: next(4000) }
          : choice === 1
            ? { type: 'resize-window', windowId, width: next(4000), height: next(4000) }
            : { type: 'set-desktop-size', width: 1024 + Math.abs(next(1500)), height: 640 + Math.abs(next(900)) };
      state = reduce(state, action, env()).state;
      for (const window of state.windows) {
        const { x, y, width } = window.rect;
        const visible = Math.min(x + width, state.size.width) - Math.max(x, 0);
        expect(visible).toBeGreaterThanOrEqual(MIN_VISIBLE_TITLE_BAR);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y + TITLE_BAR_HEIGHT).toBeLessThanOrEqual(state.size.height);
      }
    }
  });
});

describe('minimize, maximize, and restore', () => {
  it('minimizing the focused window focuses the next one', () => {
    const { state, events } = act(three(), { type: 'minimize-window', windowId: 'w3' });
    expect(win(state, 1)).toMatchObject({ id: 'w3', minimized: true });
    expect(state.focusedWindowId).toBe('w2');
    expect(events).toEqual([
      { type: 'window-minimized', windowId: 'w3' },
      { type: 'window-focused', windowId: 'w2' },
    ]);
  });

  it('minimizing twice reports nothing the second time', () => {
    const once = act(three(), { type: 'minimize-window', windowId: 'w1' }).state;
    expect(act(once, { type: 'minimize-window', windowId: 'w1' }).events).toEqual([]);
  });

  it('restoring a minimized window from the task strip focuses it', () => {
    const minimized = act(three(), { type: 'minimize-window', windowId: 'w3' }).state;
    const { state, events } = act(minimized, { type: 'activate-window', windowId: 'w3' });
    expect(win(state, 2)).toMatchObject({ id: 'w3', minimized: false });
    expect(state.focusedWindowId).toBe('w3');
    expect(events).toEqual([
      { type: 'window-restored', windowId: 'w3' },
      { type: 'window-focused', windowId: 'w3' },
    ]);
  });

  it('the task strip brings a visible window forward without minimizing it', () => {
    const { state } = act(three(), { type: 'activate-window', windowId: 'w3' });
    expect(win(state, 2)).toMatchObject({ id: 'w3', minimized: false });
  });

  it('maximizing then restoring returns the old place and size', () => {
    const start = buildDesktop({
      windows: [{ app: 'notepad', at: { x: 120, y: 80 }, size: { width: 500, height: 320 } }],
    });
    const before = win(start, 0).rect;
    const maximized = act(start, { type: 'maximize-window', windowId: 'w1' });
    expect(windowFrame(maximized.state, win(maximized.state, 0))).toEqual({ x: 0, y: 0, ...maximized.state.size });
    expect(maximized.events).toEqual([{ type: 'window-maximized', windowId: 'w1' }]);
    const restored = act(maximized.state, { type: 'unmaximize-window', windowId: 'w1' });
    expect(win(restored.state, 0).rect).toEqual(before);
    expect(windowFrame(restored.state, win(restored.state, 0))).toEqual(before);
    expect(restored.events).toEqual([{ type: 'window-unmaximized', windowId: 'w1' }]);
  });

  it('maximizing a minimized window brings it back', () => {
    const start = buildDesktop({ windows: [{ app: 'notepad', minimized: true }, { app: 'calculator' }] });
    const { state, events } = act(start, { type: 'maximize-window', windowId: 'w1' });
    expect(win(state, 1)).toMatchObject({ id: 'w1', maximized: true, minimized: false });
    expect(events.map((event) => event.type)).toEqual(['window-restored', 'window-maximized', 'window-focused']);
  });

  it('maximizing a maximized window, or restoring a normal one, reports nothing', () => {
    const maximized = buildDesktop({ windows: [{ app: 'notepad', maximized: true }] });
    expect(act(maximized, { type: 'maximize-window', windowId: 'w1' }).events).toEqual([]);
    const normal = buildDesktop({ windows: [{ app: 'notepad' }] });
    expect(act(normal, { type: 'unmaximize-window', windowId: 'w1' }).events).toEqual([]);
  });
});

describe('the desktop size', () => {
  it('clamps windows into a smaller desktop and never goes below the minimum', () => {
    const start = buildDesktop({
      size: { width: 2000, height: 1200 },
      windows: [{ app: 'notepad', at: { x: 1800, y: 1100 }, size: { width: 1900, height: 900 } }],
    });
    const { state, events } = act(start, { type: 'set-desktop-size', width: 100, height: 100 });
    expect(state.size).toEqual(MIN_DESKTOP_SIZE);
    expect(events).toEqual([{ type: 'desktop-resized', size: MIN_DESKTOP_SIZE }]);
    const { rect } = win(state, 0);
    expect(rect.width).toBe(MIN_DESKTOP_SIZE.width);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(MIN_VISIBLE_TITLE_BAR);
    expect(rect.y + TITLE_BAR_HEIGHT).toBeLessThanOrEqual(MIN_DESKTOP_SIZE.height);
  });

  it('refuses a size that is not a number', () => {
    expect(act(buildDesktop(), { type: 'set-desktop-size', width: Infinity, height: 700 }).events).toEqual([
      { type: 'rejected', action: 'set-desktop-size', reason: 'not-an-option' },
    ]);
  });
});

describe('sound', () => {
  it.each([
    ['sets the volume', { volume: 50, muted: false }, 30, { volume: 30, muted: false }, ['volume-changed']],
    ['clamps the volume', { volume: 50, muted: false }, 140, { volume: 100, muted: false }, ['volume-changed']],
    [
      'raising the volume unmutes',
      { volume: 50, muted: true },
      60,
      { volume: 60, muted: false },
      ['volume-changed', 'mute-changed'],
    ],
    ['a volume of zero stays muted', { volume: 50, muted: true }, 0, { volume: 0, muted: true }, ['volume-changed']],
    ['the same volume unmutes', { volume: 50, muted: true }, 50, { volume: 50, muted: false }, ['mute-changed']],
  ] as const)('%s', (_label, system, volume, after, types) => {
    const { state, events } = act(buildDesktop({ system }), { type: 'set-volume', volume });
    expect(state.system).toEqual(after);
    expect(events.map((event: DesktopEvent) => event.type)).toEqual(types);
  });

  it('refuses a volume that is not a number', () => {
    expect(act(buildDesktop(), { type: 'set-volume', volume: Number.NaN }).events).toEqual([
      { type: 'rejected', action: 'set-volume', reason: 'not-an-option' },
    ]);
  });

  it('mutes and unmutes, and reports nothing when already there', () => {
    const muted = act(buildDesktop(), { type: 'set-muted', muted: true });
    expect(muted.state.system.muted).toBe(true);
    expect(muted.events).toEqual([{ type: 'mute-changed', muted: true }]);
    expect(act(muted.state, { type: 'set-muted', muted: true }).events).toEqual([]);
  });
});

describe('window edges', () => {
  it.each(['notepad', 'picture-viewer', 'file-explorer', 'music-box', 'calculator', 'settings'] as const)(
    'opens a %s, shown and not maximized',
    (app) => {
      const { state } = act(buildDesktop(), { type: 'open-app', app });
      expect(win(state, 0)).toMatchObject({ app: { kind: app }, minimized: false, maximized: false });
    },
  );

  it('reports no restore when the task strip brings forward a visible window', () => {
    expect(act(three(), { type: 'activate-window', windowId: 'w1' }).events).toEqual([
      { type: 'window-focused', windowId: 'w1' },
    ]);
  });

  it('reports a move along one side only', () => {
    expect(act(placed(), { type: 'move-window', windowId: 'w1', x: 300, y: 100 }).events[0]).toMatchObject({
      type: 'window-moved',
    });
    expect(act(placed(), { type: 'move-window', windowId: 'w1', x: 100, y: 300 }).events[0]).toMatchObject({
      type: 'window-moved',
    });
  });

  it.each([
    ['only the width is too small', 10, 300, true],
    ['only the height is too small', 500, 10, true],
    ['only the height changes', 500, 350, false],
    ['only the width changes', 600, 300, false],
  ])('reports a resize when %s', (_label, width, height, clamped) => {
    const { events } = act(placed(), { type: 'resize-window', windowId: 'w1', width, height });
    expect(events[0]).toMatchObject({ type: 'window-resized', clamped });
  });

  it('reports nothing for a resize to the same size', () => {
    expect(act(placed(), { type: 'resize-window', windowId: 'w1', width: 500, height: 300 }).events).toEqual([]);
  });

  it('brings back a minimized window that was maximized without maximizing it twice', () => {
    const start = buildDesktop({
      windows: [{ app: 'notepad', maximized: true, minimized: true }, { app: 'calculator' }],
    });
    expect(act(start, { type: 'maximize-window', windowId: 'w1' }).events).toEqual([
      { type: 'window-restored', windowId: 'w1' },
      { type: 'window-focused', windowId: 'w1' },
    ]);
  });

  it('refuses to open a file once the desktop holds the most windows', () => {
    const full = buildDesktop({
      files: { List: note('x') },
      windows: Array.from({ length: MAX_WINDOWS }, () => ({ app: 'calculator' as const })),
    });
    expect(act(full, { type: 'open-file', fileId: pathId(full, 'List') }).events).toEqual([
      { type: 'rejected', action: 'open-file', reason: 'too-many-windows' },
    ]);
  });
});
