// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createManualScheduler } from '../../../core/activityKit/scheduler.ts';
import { createScope } from '../../../core/activityKit/scope.ts';
import { buildDesktop, note, picture } from '../model/build.ts';
import { LessonDesktop, type LessonKit } from '../lessons/harness/LessonDesktop.tsx';
import type { DesktopParts } from './parts.ts';

/** The kit is the desktop's edge to the shell. Speech is recorded so a test can hear a refusal. */
function fakeKit(): { kit: LessonKit; spoken: string[] } {
  const spoken: string[] = [];
  const kit: LessonKit = {
    scope: createScope(createManualScheduler({ wall: Date.UTC(2026, 10, 14) })),
    play: () => undefined,
    speak: (handle) => {
      spoken.push(handle.id);
      return Promise.resolve();
    },
    pictures: {
      list: () => Promise.reject(new Error('no pictures to list')),
      read: () => Promise.reject(new Error('no pictures to read')),
    },
    setInstruction: () => undefined,
    feedback: { correct: () => undefined, wrong: () => undefined },
    hint: () => undefined,
    roundComplete: () => undefined,
  };
  return { kit, spoken };
}

/** A file explorer showing the trash, which holds a picture and a note. */
const desktop = buildDesktop({
  files: { Pictures: {} },
  trash: { Fox: { from: 'Pictures', item: picture('fox') }, List: { from: '', item: note('milk') } },
  windows: [{ app: 'file-explorer', folder: '' }],
});

function show(parts: DesktopParts) {
  const fake = fakeKit();
  const view = render(
    <LessonDesktop level={{ desktop, parts }} band='band-9-12' kit={fake.kit} steps={[{ done: () => false }]} />,
  );
  const get = (selector: string) => {
    const found = view.container.querySelector<HTMLElement>(selector);
    if (found === null) throw new Error(`nothing matches ${selector}`);
    return found;
  };
  fireEvent.click(get('[data-place="trash"]'));
  return { ...fake, container: view.container, get };
}

describe('hidden commands', () => {
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

  it.each([
    ['shows Empty trash when nothing is hidden', [], true],
    ['leaves Empty trash out of the toolbar and the File menu when hidden', ['empty-trash'], false],
  ] as const)('%s', (_label, hiddenCommands, shown) => {
    const { container, get } = show({ hiddenCommands });
    expect(container.querySelector('[data-explorer-command="empty-trash"]') !== null).toBe(shown);
    expect(container.querySelector('[data-explorer-command="restore"]')).not.toBeNull();
    fireEvent.click(get('[data-menu="file"]'));
    expect(container.querySelector('[data-command="empty-trash"]') !== null).toBe(shown);
    expect(container.querySelector('[data-command="restore"]')).not.toBeNull();
  });
});

describe('the trash in the file explorer', () => {
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

  it('picks an item with one click, without trying to open it, so Restore can bring it back', () => {
    const { container, get, spoken } = show({});
    const restore = get('[data-explorer-command="restore"]');
    expect(restore).toHaveProperty('disabled', true);
    fireEvent.click(get('[data-item="Fox"] .td-item-open'));
    // Nothing in the trash opens, so the click says nothing about where things go.
    expect(spoken).toEqual([]);
    expect(get('[data-item="Fox"]').getAttribute('data-selected')).toBe('true');
    expect(restore).toHaveProperty('disabled', false);
    fireEvent.click(restore);
    expect(container.querySelector('[data-item="Fox"]')).toBeNull();
    expect(container.querySelector('[data-item="List"]')).not.toBeNull();
  });
});
