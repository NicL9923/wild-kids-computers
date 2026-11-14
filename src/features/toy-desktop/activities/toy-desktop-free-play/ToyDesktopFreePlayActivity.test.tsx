// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KitState } from '../../../../activityShell/kit.ts';
import { createFakeKit } from '../../../../activityShell/testing/fakeKit.ts';
import { buildDesktop } from '../../model/build.ts';
import type { DesktopState } from '../../model/state.ts';
import { generateLevel } from './level.ts';
import { SAVE_PAUSE_MS } from './saving.ts';
import ToyDesktopFreePlayActivity from './ToyDesktopFreePlayActivity.tsx';

/** A notepad with a sentence that was never saved, on the child's own desktop. */
function show() {
  const checkpointsAtSave: number[] = [];
  let value = buildDesktop({ windows: [{ app: 'notepad', text: 'I like frogs.' }] });
  const state: KitState<DesktopState> = {
    get value() {
      return value;
    },
    loaded: true,
    update: (change) => {
      value = change(value);
      checkpointsAtSave.push(checkpoints());
    },
  };
  const fake = createFakeKit<DesktopState>({ state });
  const checkpoints = () => fake.calls.filter((call) => call.call === 'checkpoint').length;
  // The gallery is empty, so no paintings join the desktop.
  const kit = {
    ...fake.kit,
    pictures: { ...fake.kit.pictures, list: () => Promise.resolve({ ok: true as const, value: [] }) },
  };
  const view = render(<ToyDesktopFreePlayActivity level={generateLevel(1, 'band-6-8')} band='band-6-8' kit={kit} />);
  const get = (selector: string) => {
    const found = view.container.querySelector<HTMLElement>(selector);
    if (found === null) throw new Error(`nothing matches ${selector}`);
    return found;
  };
  const wait = (ms: number) => {
    act(() => {
      fake.scheduler.advance(ms);
    });
  };
  return { fake, get, wait, checkpoints, checkpointsAtSave };
}

describe('toy desktop free play and the session length', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = () => undefined;
        disconnect = () => undefined;
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('reaches a calm moment once a change is saved, and not while the child is typing', () => {
    const { get, wait, checkpoints, checkpointsAtSave } = show();
    fireEvent.keyDown(get('[data-window] textarea'), { key: 'A' });
    wait(SAVE_PAUSE_MS);
    expect([checkpointsAtSave, checkpoints()]).toEqual([[0], 0]);

    fireEvent.click(get('[data-window-control="minimize"]'));
    wait(SAVE_PAUSE_MS - 1);
    expect(checkpoints()).toBe(0);
    wait(1);
    // Saved first, then the check, so the closing screen never loses a change.
    expect([checkpointsAtSave, checkpoints()]).toEqual([[0, 0], 1]);
  });

  it('holds the check while a save dialog is open, and lets go when it closes', () => {
    const { fake, get } = show();
    fireEvent.click(get('[data-menu="file"]'));
    fireEvent.click(get('[data-command="save"]'));
    expect(fake.holds()).toBe(1);
    fireEvent.keyDown(get('[data-file-dialog="save-as"] input'), { key: 'Escape' });
    expect(fake.holds()).toBe(0);
  });
});
