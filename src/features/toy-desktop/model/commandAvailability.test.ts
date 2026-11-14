import { describe, expect, it } from 'vitest';
import { createToyClipboard, type ToyClipboard } from '../../../app/inputGuards.ts';
import { buildDesktop, note, pathId, picture, tune } from './build.ts';
import type { CalculatorKey } from './apps/calculator.ts';
import type { CommandId } from './commands.ts';
import { reduceAll, type DesktopAction } from './desktop.ts';
import { TRASH_ID } from './fileSystem.ts';
import { isCommandEnabled, menuBar } from './menus.ts';
import { MAX_WINDOWS, type DesktopState } from './state.ts';

const files = {
  Pictures: { Fox: picture('fox'), Owl: picture('owl') },
  Lone: { Dog: picture('dog') },
  Notes: { List: note('milk') },
  Songs: { Hum: tune([[0, 0]]) },
};

function enabled(state: DesktopState, windowId: string, clipboard: ToyClipboard = createToyClipboard()): CommandId[] {
  return menuBar(state, windowId, clipboard).flatMap((menu) =>
    menu.items.filter((item) => item.enabled).map((item) => item.command),
  );
}

function after(state: DesktopState, ...actions: DesktopAction[]): DesktopState {
  return reduceAll(state, actions, { clipboard: createToyClipboard() }).state;
}

const command = (windowId: string, name: CommandId): DesktopAction => ({ type: 'command', windowId, command: name });

const key = (pressed: CalculatorKey): DesktopAction => ({ type: 'calculator', windowId: 'w1', key: pressed });

describe('the menu bar of each app', () => {
  it('lists the menus and commands every app shows, in order', () => {
    // This is the contract screens draw from and the "Menus" lesson searches.
    const state = buildDesktop({
      windows: [
        { app: 'notepad' },
        { app: 'picture-viewer' },
        { app: 'file-explorer' },
        { app: 'music-box' },
        { app: 'calculator' },
        { app: 'settings' },
      ],
    });
    const layout = state.windows.map((window) =>
      menuBar(state, window.id, createToyClipboard()).map((menu) => [menu.id, menu.items.map((item) => item.command)]),
    );
    expect(layout).toEqual([
      [
        ['file', ['new', 'open', 'save', 'save-as', 'close']],
        ['edit', ['undo', 'redo', 'cut', 'copy', 'paste', 'select-all']],
      ],
      [
        ['file', ['open', 'close']],
        ['view', ['previous', 'next']],
      ],
      [
        ['file', ['open', 'new-folder', 'rename', 'delete', 'restore', 'empty-trash', 'close']],
        ['edit', ['undo', 'redo', 'cut', 'copy', 'paste', 'select-all']],
        ['go', ['go-up']],
      ],
      [
        ['file', ['new', 'open', 'save', 'save-as', 'close']],
        ['edit', ['undo', 'redo', 'clear']],
        ['play', ['play', 'stop']],
      ],
      [
        ['file', ['close']],
        ['edit', ['copy', 'paste', 'clear']],
      ],
      [
        ['file', ['close']],
        ['edit', ['undo', 'redo', 'cut', 'copy', 'paste', 'select-all']],
      ],
    ]);
  });
});

describe('which commands are enabled', () => {
  it.each<[string, () => DesktopState, CommandId[]]>([
    [
      'a fresh notepad',
      () => buildDesktop({ windows: [{ app: 'notepad' }] }),
      ['new', 'open', 'save', 'save-as', 'close'],
    ],
    [
      'a saved note with no changes',
      () => buildDesktop({ files, windows: [{ file: 'Notes/List' }] }),
      ['new', 'open', 'save-as', 'close', 'select-all'],
    ],
    [
      'a notepad with an open dialog',
      () => after(buildDesktop({ windows: [{ app: 'notepad', text: 'hi' }] }), command('w1', 'open')),
      ['close'],
    ],
    [
      'a notepad with a save dialog holding a name',
      () => after(buildDesktop({ files, windows: [{ file: 'Notes/List' }] }), command('w1', 'save-as')),
      ['close', 'cut', 'copy', 'select-all'],
    ],
    ['an empty picture viewer', () => buildDesktop({ windows: [{ app: 'picture-viewer' }] }), ['open', 'close']],
    [
      'a picture with a neighbour',
      () => buildDesktop({ files, windows: [{ file: 'Pictures/Fox' }] }),
      ['open', 'close', 'previous', 'next'],
    ],
    [
      'a picture alone in its folder',
      () => buildDesktop({ files, windows: [{ file: 'Lone/Dog' }] }),
      ['open', 'close'],
    ],
    [
      'a picture that went to the trash',
      () => {
        const state = buildDesktop({ files, windows: [{ file: 'Pictures/Fox' }, { app: 'file-explorer' }] });
        return after(state, {
          type: 'explorer',
          windowId: 'w2',
          action: { type: 'move', nodeId: pathId(state, 'Pictures/Fox'), toId: TRASH_ID },
        });
      },
      ['open', 'close'],
    ],
    [
      'an explorer at home',
      () => buildDesktop({ files, windows: [{ app: 'file-explorer' }] }),
      ['new-folder', 'close'],
    ],
    [
      'an explorer with a folder selected',
      () => {
        const state = buildDesktop({ files, windows: [{ app: 'file-explorer' }] });
        return after(state, {
          type: 'explorer',
          windowId: 'w1',
          action: { type: 'select', nodeId: pathId(state, 'Notes') },
        });
      },
      ['open', 'new-folder', 'rename', 'delete', 'close'],
    ],
    [
      'an explorer with the trash selected',
      () =>
        after(buildDesktop({ files, windows: [{ app: 'file-explorer' }] }), {
          type: 'explorer',
          windowId: 'w1',
          action: { type: 'select', nodeId: TRASH_ID },
        }),
      ['open', 'new-folder', 'close'],
    ],
    [
      'an explorer in the middle of a rename',
      () => {
        const state = buildDesktop({ files, windows: [{ app: 'file-explorer' }] });
        return after(state, {
          type: 'explorer',
          windowId: 'w1',
          action: { type: 'start-rename', nodeId: pathId(state, 'Notes') },
        });
      },
      ['open', 'close', 'cut', 'copy', 'select-all'],
    ],
    [
      'an explorer in a folder',
      () => buildDesktop({ files, windows: [{ app: 'file-explorer', folder: 'Notes' }] }),
      ['new-folder', 'close', 'go-up'],
    ],
    [
      'a fresh music box',
      () => buildDesktop({ windows: [{ app: 'music-box' }] }),
      ['new', 'open', 'save', 'save-as', 'close', 'play'],
    ],
    [
      'a music box with a note, playing',
      () =>
        after(
          buildDesktop({ windows: [{ app: 'music-box' }] }),
          { type: 'music-box', windowId: 'w1', action: { type: 'toggle', step: 0, note: 0 } },
          command('w1', 'play'),
        ),
      ['new', 'open', 'save', 'save-as', 'close', 'undo', 'clear', 'stop'],
    ],
    [
      'a music box after an undo',
      () =>
        after(
          buildDesktop({ windows: [{ app: 'music-box' }] }),
          { type: 'music-box', windowId: 'w1', action: { type: 'toggle', step: 0, note: 0 } },
          command('w1', 'undo'),
        ),
      ['new', 'open', 'save', 'save-as', 'close', 'redo', 'play'],
    ],
    ['a calculator', () => buildDesktop({ windows: [{ app: 'calculator' }] }), ['close', 'copy', 'clear']],
    [
      'a calculator showing a problem',
      () =>
        after(
          buildDesktop({ windows: [{ app: 'calculator' }] }),
          key({ type: 'digit', digit: 4 }),
          key({ type: 'operator', operator: 'divide' }),
          key({ type: 'digit', digit: 0 }),
          key({ type: 'equals' }),
        ),
      ['close', 'clear'],
    ],
    ['a settings panel', () => buildDesktop({ windows: [{ app: 'settings' }] }), ['close', 'select-all']],
  ])('in %s', (_label, make, commands) => {
    expect(enabled(make(), 'w1')).toEqual(commands);
  });

  it('turns paste on once the clipboard holds text, and for the calculator only a number', () => {
    const clipboard = createToyClipboard();
    const state = buildDesktop({ windows: [{ app: 'notepad' }, { app: 'calculator' }] });
    expect(isCommandEnabled(state, 'w1', 'paste', clipboard)).toBe(false);
    clipboard.write({ kind: 'text', text: 'fox' });
    expect(isCommandEnabled(state, 'w1', 'paste', clipboard)).toBe(true);
    expect(isCommandEnabled(state, 'w2', 'paste', clipboard)).toBe(false);
    clipboard.write({ kind: 'text', text: '42' });
    expect(isCommandEnabled(state, 'w2', 'paste', clipboard)).toBe(true);
  });

  it('turns New off once the desktop holds the most windows', () => {
    const full = buildDesktop({ windows: Array.from({ length: MAX_WINDOWS }, () => ({ app: 'notepad' as const })) });
    expect(isCommandEnabled(full, 'w1', 'new', createToyClipboard())).toBe(false);
  });

  it('says no for a window that is not there', () => {
    expect(isCommandEnabled(buildDesktop(), 'w9', 'close', createToyClipboard())).toBe(false);
  });

  it('asks without touching the clipboard', () => {
    const clipboard = createToyClipboard();
    clipboard.write({ kind: 'text', text: 'kept' });
    const state = after(buildDesktop({ windows: [{ app: 'notepad', text: 'secret' }] }), command('w1', 'select-all'));
    expect(isCommandEnabled(state, 'w1', 'copy', clipboard)).toBe(true);
    expect(isCommandEnabled(state, 'w1', 'cut', clipboard)).toBe(true);
    expect(clipboard.read()?.text).toBe('kept');
  });

  it('sends edit commands to the rename field while renaming, and to the search field otherwise', () => {
    const clipboard = createToyClipboard();
    const state = buildDesktop({ files, windows: [{ app: 'file-explorer' }] });
    const searching = reduceAll(
      state,
      [
        { type: 'text', windowId: 'w1', field: 'search', op: { type: 'insert', text: 'f' } },
        command('w1', 'select-all'),
        command('w1', 'copy'),
      ],
      { clipboard },
    );
    expect(clipboard.read()?.text).toBe('f');
    const renaming = reduceAll(
      searching.state,
      [
        { type: 'explorer', windowId: 'w1', action: { type: 'start-rename', nodeId: pathId(state, 'Notes') } },
        command('w1', 'copy'),
      ],
      { clipboard },
    );
    expect(clipboard.read()?.text).toBe('Notes');
    expect(renaming.events.at(-1)).toEqual({ type: 'copied', windowId: 'w1', text: 'Notes' });
  });
});
