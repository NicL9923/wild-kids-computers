import { describe, expect, it } from 'vitest';
import { buildDesktop } from '../model/build.ts';
import { topVisibleWindow } from '../model/state.ts';
import { ALL_PARTS, fitForParts, isHighlighted, withDefaults } from './parts.ts';

describe('isHighlighted', () => {
  const close = { kind: 'window-control', windowId: 'w1', control: 'close' } as const;

  it('matches the same control', () => {
    expect(isHighlighted({ ...close }, close)).toBe(true);
  });

  it.each([
    ['no target', null],
    ['another window', { ...close, windowId: 'w2' }],
    ['another control', { ...close, control: 'minimize' }],
    ['another kind', { kind: 'task', windowId: 'w1' }],
  ] as const)('does not match %s', (_label, target) => {
    expect(isHighlighted(target, close)).toBe(false);
  });

  it('does not match a target with fewer fields', () => {
    expect(isHighlighted({ kind: 'launcher' }, { kind: 'launch-app', app: 'notepad' })).toBe(false);
  });
});

describe('withDefaults', () => {
  it('keeps what a lesson sets and fills in the rest as a whole computer', () => {
    const parts = withDefaults({ menuBar: false, windowControls: ['close'] });
    expect(parts.menuBar).toBe(false);
    expect(parts.windowControls).toEqual(['close']);
    expect(parts.taskStrip).toBe(ALL_PARTS.taskStrip);
    expect(withDefaults()).toEqual(ALL_PARTS);
  });

  it.each([
    [
      'takes Close out of the menus and shortcuts with the close button',
      ['minimize'],
      ['empty-trash'],
      ['empty-trash', 'close'],
    ],
    ['keeps Close where the close button shows', ['close'], ['empty-trash'], ['empty-trash']],
  ] as const)('%s', (_label, windowControls, hiddenCommands, hidden) => {
    expect(withDefaults({ windowControls, hiddenCommands }).hiddenCommands).toEqual(hidden);
  });
});

describe('fitForParts', () => {
  // Saved by an older band, with one window put away in the task strip.
  const saved = buildDesktop({ windows: [{ app: 'notepad' }, { app: 'calculator', minimized: true }] });

  it('shows a minimized window again where no task strip could bring it back', () => {
    const fitted = fitForParts(saved, withDefaults({ taskStrip: false }));
    expect(fitted.windows.map((window) => window.minimized)).toEqual([false, false]);
    expect(fitted.focusedWindowId).toBe(topVisibleWindow(fitted)?.id);
  });

  it('leaves the desktop as saved when the task strip shows', () => {
    expect(fitForParts(saved, withDefaults())).toBe(saved);
  });
});
