import { describe, expect, it } from 'vitest';
import { createToyClipboard } from '../../../app/inputGuards.ts';
import { buildDesktop } from './build.ts';
import { reduceAll, type DesktopAction } from './desktop.ts';
import { applyFault, isFaultFixed, MOSTLY_VISIBLE, type Fault } from './faults.ts';
import { visibleFraction } from './geometry.ts';
import type { DesktopState } from './state.ts';

function desktop(): DesktopState {
  return buildDesktop({
    windows: [
      { app: 'notepad', at: { x: 200, y: 100 }, size: { width: 500, height: 360 } },
      { app: 'calculator' },
      { app: 'music-box' },
    ],
  });
}

const act = (state: DesktopState, ...actions: DesktopAction[]) =>
  reduceAll(state, actions, { clipboard: createToyClipboard() }).state;

describe('faults for the Fix it lesson', () => {
  it.each<[string, Fault, DesktopAction[]]>([
    ['muted sound, fixed by unmuting', { kind: 'sound-muted' }, [{ type: 'set-muted', muted: false }]],
    ['muted sound, fixed by raising the volume', { kind: 'sound-muted' }, [{ type: 'set-volume', volume: 90 }]],
    [
      'a minimized window, fixed from the task strip',
      { kind: 'window-minimized', windowId: 'w1' },
      [{ type: 'activate-window', windowId: 'w1' }],
    ],
    [
      'a minimized window, fixed by switching windows',
      { kind: 'window-minimized', windowId: 'w1' },
      [{ type: 'focus-next-window' }],
    ],
    [
      'a covered window, fixed by minimizing the cover',
      { kind: 'window-behind', windowId: 'w1', coveredBy: 'w2' },
      [
        { type: 'minimize-window', windowId: 'w2' },
        { type: 'minimize-window', windowId: 'w3' },
      ],
    ],
    [
      'a covered window, fixed from the task strip',
      { kind: 'window-behind', windowId: 'w1', coveredBy: 'w2' },
      [{ type: 'activate-window', windowId: 'w1' }],
    ],
    [
      'a window off to the left, fixed by dragging it back',
      { kind: 'window-off-side', windowId: 'w1', side: 'left' },
      [{ type: 'move-window', windowId: 'w1', x: 100, y: 100 }],
    ],
    [
      'a window off to the right, fixed by maximizing',
      { kind: 'window-off-side', windowId: 'w1', side: 'right' },
      [{ type: 'maximize-window', windowId: 'w1' }],
    ],
    [
      'the wrong app in front, fixed by clicking the right one',
      { kind: 'wrong-app-in-front', windowId: 'w3' },
      [{ type: 'focus-window', windowId: 'w3' }],
    ],
  ])('%s', (_label, fault, fix) => {
    const broken = applyFault(desktop(), fault);
    expect(isFaultFixed(broken, fault)).toBe(false);
    expect(isFaultFixed(act(broken, ...fix), fault)).toBe(true);
  });

  it('keeps a muted desktop broken while the volume stays at zero', () => {
    const fault: Fault = { kind: 'sound-muted' };
    const silent = act(
      applyFault(desktop(), fault),
      { type: 'set-volume', volume: 0 },
      { type: 'set-muted', muted: false },
    );
    expect(silent.system).toEqual({ volume: 0, muted: false });
    expect(isFaultFixed(silent, fault)).toBe(false);
  });

  it('moves focus off a window it minimizes', () => {
    const broken = applyFault(desktop(), { kind: 'window-minimized', windowId: 'w3' });
    expect(broken.focusedWindowId).toBe('w2');
  });

  it('keeps the focus when it minimizes a window without focus', () => {
    const broken = applyFault(desktop(), { kind: 'window-minimized', windowId: 'w1' });
    expect(broken.focusedWindowId).toBe('w3');
  });

  it('covers the hidden window exactly and puts it at the back', () => {
    const broken = applyFault(desktop(), { kind: 'window-behind', windowId: 'w1', coveredBy: 'w2' });
    expect(broken.windows.map((window) => window.id)).toEqual(['w1', 'w3', 'w2']);
    expect(broken.windows[2]?.rect).toEqual(broken.windows[0]?.rect);
    expect(broken.focusedWindowId).toBe('w2');
  });

  it('leaves a grab-sized part of an off-side window showing, and needs most of it back', () => {
    const fault: Fault = { kind: 'window-off-side', windowId: 'w1', side: 'left' };
    const broken = applyFault(desktop(), fault);
    const rect = broken.windows[0]?.rect;
    if (rect === undefined) throw new Error('no window');
    expect(visibleFraction(rect, broken.size)).toBeLessThan(MOSTLY_VISIBLE);
    // Just short of mostly visible is still broken; just past it is fixed.
    const almost = act(broken, {
      type: 'move-window',
      windowId: 'w1',
      x: -Math.ceil(rect.width * (1 - MOSTLY_VISIBLE)) - 1,
      y: rect.y,
    });
    expect(isFaultFixed(almost, fault)).toBe(false);
    const enough = act(broken, {
      type: 'move-window',
      windowId: 'w1',
      x: -Math.floor(rect.width * (1 - MOSTLY_VISIBLE)),
      y: rect.y,
    });
    expect(isFaultFixed(enough, fault)).toBe(true);
  });

  it('is not fixed while the window is minimized, or once it is closed', () => {
    const fault: Fault = { kind: 'window-off-side', windowId: 'w1', side: 'right' };
    const broken = applyFault(desktop(), fault);
    const moved = act(
      broken,
      { type: 'move-window', windowId: 'w1', x: 10, y: 10 },
      { type: 'minimize-window', windowId: 'w1' },
    );
    expect(isFaultFixed(moved, fault)).toBe(false);
    expect(isFaultFixed(act(broken, { type: 'close-window', windowId: 'w1' }), fault)).toBe(false);
  });

  it('sends the right window behind the others for the wrong-app fault', () => {
    const broken = applyFault(desktop(), { kind: 'wrong-app-in-front', windowId: 'w3' });
    expect(broken.windows[0]?.id).toBe('w3');
    expect(broken.focusedWindowId).toBe('w2');
  });

  it.each<[string, Fault]>([
    ['a missing window', { kind: 'window-minimized', windowId: 'w9' }],
    ['a missing cover', { kind: 'window-behind', windowId: 'w1', coveredBy: 'w9' }],
  ])('throws for %s', (_label, fault) => {
    expect(() => applyFault(desktop(), fault)).toThrow('no window w9');
  });

  it('throws for the wrong-app fault with no other window to put in front', () => {
    const alone = buildDesktop({ windows: [{ app: 'notepad' }] });
    expect(() => applyFault(alone, { kind: 'wrong-app-in-front', windowId: 'w1' })).toThrow(
      'needs another visible window',
    );
  });
});
