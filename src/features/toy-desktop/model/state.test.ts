import { describe, expect, it } from 'vitest';
import { createToyClipboard } from '../../../app/inputGuards.ts';
import { buildDesktop } from './build.ts';
import { reduce } from './desktop.ts';
import { focusedWindow, hasUnsavedChanges } from './state.ts';

describe('state helpers', () => {
  it('finds the focused window, or none', () => {
    expect(focusedWindow(buildDesktop({ windows: [{ app: 'notepad' }, { app: 'calculator' }] }))?.app.kind).toBe(
      'calculator',
    );
    expect(focusedWindow(buildDesktop())).toBeUndefined();
  });

  it('says a music box has unsaved changes once a note is toggled, and a calculator never does', () => {
    const state = buildDesktop({ windows: [{ app: 'music-box' }, { app: 'calculator' }] });
    const [box, calculator] = state.windows;
    expect(box !== undefined && hasUnsavedChanges(box.app)).toBe(false);
    const toggled = reduce(
      state,
      { type: 'music-box', windowId: 'w1', action: { type: 'toggle', step: 0, note: 0 } },
      { clipboard: createToyClipboard() },
    );
    const after = toggled.state.windows[0];
    expect(after !== undefined && hasUnsavedChanges(after.app)).toBe(true);
    expect(calculator !== undefined && hasUnsavedChanges(calculator.app)).toBe(false);
  });
});
