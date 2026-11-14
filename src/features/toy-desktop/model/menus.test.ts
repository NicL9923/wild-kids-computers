import { describe, expect, it } from 'vitest';
import { createToyClipboard } from '../../../app/inputGuards.ts';
import { buildDesktop, note, pathId, picture, tune } from './build.ts';
import { commandsForKey, matchesShortcut, shortcutKeys, SHORTCUTS, type CommandId, type KeyPress } from './commands.ts';
import { reduce, reduceAll, type DesktopAction } from './desktop.ts';
import { TRASH_ID } from './fileSystem.ts';
import { commandForKey, isCommandEnabled, menuBar } from './menus.ts';
import type { DesktopState } from './state.ts';

const key = (pressed: string, modifiers: Partial<Omit<KeyPress, 'key'>> = {}): KeyPress => ({
  key: pressed,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers,
});

function enabled(state: DesktopState, windowId: string, clipboard = createToyClipboard()): CommandId[] {
  return menuBar(state, windowId, clipboard).flatMap((menu) =>
    menu.items.filter((item) => item.enabled).map((item) => item.command),
  );
}

const files = {
  Pictures: { Fox: picture('fox'), Owl: picture('owl') },
  Notes: { List: note('milk') },
  Songs: { Hum: tune([[0, 0]]) },
};

describe('shortcuts', () => {
  it('shows Command on a Mac and Ctrl elsewhere', () => {
    const saveAs = SHORTCUTS['save-as'];
    if (saveAs === undefined) throw new Error('no shortcut');
    expect(shortcutKeys(saveAs, 'mac')).toEqual({ modifiers: ['command', 'shift'], key: 'S' });
    expect(shortcutKeys(saveAs, 'windows')).toEqual({ modifiers: ['control', 'shift'], key: 'S' });
    expect(shortcutKeys({ primary: false, shift: false, key: 'Delete' }, 'linux')).toEqual({
      modifiers: [],
      key: 'Delete',
    });
  });

  it.each([
    ['Ctrl+C on Windows', key('c', { ctrlKey: true }), 'windows', ['copy']],
    ['Command+C on a Mac', key('c', { metaKey: true }), 'mac', ['copy']],
    ['Ctrl+C on a Mac is not copy', key('c', { ctrlKey: true }), 'mac', []],
    ['Command+C on Linux is not copy', key('c', { metaKey: true }), 'linux', []],
    ['Ctrl+Shift+Z redoes', key('Z', { ctrlKey: true, shiftKey: true }), 'linux', ['redo']],
    ['Ctrl+Y redoes on Windows', key('y', { ctrlKey: true }), 'windows', ['redo']],
    ['Command+Y does nothing on a Mac', key('y', { metaKey: true }), 'mac', []],
    ['Alt blocks a shortcut', key('s', { ctrlKey: true, altKey: true }), 'windows', []],
    ['Shift changes Ctrl+S into save as', key('S', { ctrlKey: true, shiftKey: true }), 'windows', ['save-as']],
    ['Ctrl+Shift+N makes a folder', key('N', { ctrlKey: true, shiftKey: true }), 'windows', ['new-folder']],
    ['Space is play and stop', key(' '), 'mac', ['play', 'stop']],
    ['a plain letter is nothing', key('c'), 'windows', []],
  ] as const)('%s', (_label, press, os, commands) => {
    expect(commandsForKey(press, os)).toEqual(commands);
  });

  it('matches Delete only without a modifier', () => {
    const shortcut = { primary: false, shift: false, key: 'Delete' };
    expect(matchesShortcut(key('Delete'), shortcut, 'windows')).toBe(true);
    expect(matchesShortcut(key('Delete', { ctrlKey: true }), shortcut, 'windows')).toBe(false);
  });
});

describe('menu bars', () => {
  it('gives each menu item its shortcut', () => {
    const state = buildDesktop({ windows: [{ app: 'notepad' }] });
    const edit = menuBar(state, 'w1', createToyClipboard()).find((menu) => menu.id === 'edit');
    expect(edit?.items.find((item) => item.command === 'copy')?.shortcut).toEqual({
      primary: true,
      shift: false,
      key: 'C',
    });
    expect(menuBar(state, 'w9', createToyClipboard())).toEqual([]);
  });

  it('turns edit commands on as the note allows them', () => {
    const clipboard = createToyClipboard();
    const fresh = buildDesktop({ windows: [{ app: 'notepad' }] });
    expect(enabled(fresh, 'w1', clipboard)).toEqual(['new', 'open', 'save', 'save-as', 'close']);
    const typed = reduceAll(
      fresh,
      [
        { type: 'text', windowId: 'w1', field: 'document', op: { type: 'insert', text: 'a' } },
        { type: 'text', windowId: 'w1', field: 'document', op: { type: 'select', anchor: 0, caret: 1 } },
      ],
      { clipboard },
    ).state;
    expect(enabled(typed, 'w1', clipboard)).toEqual([
      'new',
      'open',
      'save',
      'save-as',
      'close',
      'undo',
      'cut',
      'copy',
      'select-all',
    ]);
    clipboard.write({ kind: 'text', text: 'x' });
    expect(enabled(typed, 'w1', clipboard)).toContain('paste');
  });

  it('turns on the explorer commands that fit the selection', () => {
    const state = buildDesktop({ files, windows: [{ app: 'file-explorer' }] });
    expect(enabled(state, 'w1')).toEqual(['new-folder', 'close']);
    const selected = reduce(
      state,
      { type: 'explorer', windowId: 'w1', action: { type: 'select', nodeId: pathId(state, 'Notes') } },
      { clipboard: createToyClipboard() },
    ).state;
    expect(enabled(selected, 'w1')).toEqual(['open', 'new-folder', 'rename', 'delete', 'close']);
  });

  it('turns on restore and empty trash in the trash', () => {
    const state = buildDesktop({
      files,
      trash: { Old: { from: 'Notes', item: note() } },
      windows: [{ app: 'file-explorer' }],
    });
    const env = { clipboard: createToyClipboard() };
    const old = Object.values(state.fs.nodes).find((node) => node.name === 'Old')?.id ?? '';
    const inTrash = reduceAll(
      state,
      [
        { type: 'explorer', windowId: 'w1', action: { type: 'open-node', nodeId: TRASH_ID } },
        { type: 'explorer', windowId: 'w1', action: { type: 'select', nodeId: old } },
      ],
      env,
    ).state;
    expect(enabled(inTrash, 'w1')).toEqual(['restore', 'empty-trash', 'close', 'go-up']);
  });

  it('turns everything off in a minimized window', () => {
    const state = buildDesktop({ windows: [{ app: 'notepad', minimized: true }, { app: 'calculator' }] });
    expect(enabled(state, 'w1')).toEqual([]);
  });

  it('turns play off while playing and stop on', () => {
    const state = buildDesktop({ windows: [{ app: 'music-box' }] });
    const playing = reduce(
      state,
      { type: 'command', windowId: 'w1', command: 'play' },
      { clipboard: createToyClipboard() },
    ).state;
    expect(isCommandEnabled(playing, 'w1', 'play', createToyClipboard())).toBe(false);
    expect(isCommandEnabled(playing, 'w1', 'stop', createToyClipboard())).toBe(true);
    expect(commandForKey(playing, 'w1', key(' '), 'mac', createToyClipboard())).toBe('stop');
    expect(commandForKey(state, 'w1', key(' '), 'mac', createToyClipboard())).toBe('play');
    expect(commandForKey(state, 'w1', key('q', { metaKey: true }), 'mac', createToyClipboard())).toBeNull();
  });

  it('runs every command a menu shows as enabled, in every app', () => {
    // A command the menu offers must never be refused: the menu and the reducer agree.
    const clipboard = createToyClipboard();
    clipboard.write({ kind: 'text', text: '12' });
    const base = buildDesktop({
      files,
      trash: { Old: { from: 'Notes', item: note() } },
      windows: [
        { app: 'notepad', text: 'hello' },
        { file: 'Pictures/Fox' },
        { app: 'file-explorer' },
        { file: 'Songs/Hum' },
        { app: 'calculator' },
        { app: 'settings' },
      ],
    });
    const env = { clipboard };
    const prepared: DesktopAction[] = [
      { type: 'text', windowId: 'w1', field: 'document', op: { type: 'select', anchor: 0, caret: 2 } },
      { type: 'explorer', windowId: 'w3', action: { type: 'select', nodeId: pathId(base, 'Pictures') } },
      { type: 'music-box', windowId: 'w4', action: { type: 'toggle', step: 1, note: 1 } },
      { type: 'text', windowId: 'w6', field: 'computer-name', op: { type: 'select', anchor: 0, caret: 2 } },
    ];
    const state = reduceAll(base, prepared, env).state;
    let checked = 0;
    for (const window of state.windows) {
      for (const menu of menuBar(state, window.id, clipboard)) {
        for (const item of menu.items.filter((entry) => entry.enabled)) {
          const { events } = reduce(state, { type: 'command', windowId: window.id, command: item.command }, env);
          expect(
            events.filter((event) => event.type === 'rejected'),
            `${window.app.kind} ${item.command}`,
          ).toEqual([]);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(30);
  });
});

describe('the conventional shortcuts', () => {
  // These are the keys real computers use. The shortcut lessons teach them, and nothing else pins them.
  it.each<[CommandId, string, boolean]>([
    ['new', 'N', false],
    ['open', 'O', false],
    ['save', 'S', false],
    ['save-as', 'S', true],
    ['close', 'W', false],
    ['undo', 'Z', false],
    ['redo', 'Z', true],
    ['cut', 'X', false],
    ['copy', 'C', false],
    ['paste', 'V', false],
    ['select-all', 'A', false],
    ['new-folder', 'N', true],
    ['go-up', 'ArrowUp', false],
  ])('runs %s with the primary modifier and %s', (command, pressed, shift) => {
    expect(
      commandsForKey(
        key(pressed.length === 1 ? pressed.toLowerCase() : pressed, { ctrlKey: true, shiftKey: shift }),
        'windows',
      ),
    ).toEqual([command]);
  });

  it.each<[CommandId, string]>([
    ['delete', 'Delete'],
    ['previous', 'ArrowLeft'],
    ['next', 'ArrowRight'],
  ])('runs %s with %s alone', (command, pressed) => {
    expect(commandsForKey(key(pressed), 'linux')).toEqual([command]);
  });
});
