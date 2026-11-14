import { describe, expect, it } from 'vitest';
import { createToyClipboard } from '../../../app/inputGuards.ts';
import { parseDocument } from '../../../core/storage/document.ts';
import { ALERT_SOUNDS, LIST_VISIBLE_ROWS } from './apps/settingsPanel.ts';
import { buildDesktop, note, pathId, picture, tune } from './build.ts';
import { reduceAll, type DesktopAction } from './desktop.ts';
import { HOME_ID, MAX_NODES, TRASH_ID } from './fileSystem.ts';
import { sampleDesktop } from './sampleContent.ts';
import { desktopDocument } from './schema.ts';
import { MAX_WINDOWS, type DesktopState, type WindowState } from './state.ts';
import type { TextEditorState } from './textEditor.ts';

/** A desktop with every app open and something in flight in each. */
function busyDesktop(): DesktopState {
  const base = buildDesktop({
    files: {
      Notes: { List: note('milk'), Fox: note('a fox note'), Long: note('x'.repeat(1500)) },
      Pictures: { Fox: picture('fox') },
      Songs: { Hum: tune([[0, 0]]) },
      // Enough items that ids reach two digits.
      Extra: { A: note(), B: note(), C: note(), D: note(), E: note() },
    },
    trash: { Old: { from: 'Notes', item: note('gone') }, old: { from: 'Songs', item: note('also gone') } },
    settings: { computerName: 'Z'.repeat(24) },
    windows: [
      { file: 'Notes/List' },
      { file: 'Pictures/Fox', maximized: true },
      { app: 'file-explorer', folder: 'Notes' },
      { file: 'Songs/Hum' },
      { app: 'calculator', minimized: true },
      { app: 'settings' },
    ],
  });
  const actions: DesktopAction[] = [
    { type: 'text', windowId: 'w1', field: 'document', op: { type: 'insert', text: ' and tea' } },
    { type: 'command', windowId: 'w1', command: 'save-as' },
    { type: 'explorer', windowId: 'w3', action: { type: 'start-rename', nodeId: pathId(base, 'Notes/List') } },
    { type: 'music-box', windowId: 'w4', action: { type: 'toggle', step: 3, note: 2 } },
    { type: 'command', windowId: 'w4', command: 'play' },
    { type: 'calculator', windowId: 'w5', key: { type: 'digit', digit: 4 } },
    { type: 'calculator', windowId: 'w5', key: { type: 'digit', digit: 2 } },
    { type: 'calculator', windowId: 'w5', key: { type: 'operator', operator: 'add' } },
    { type: 'calculator', windowId: 'w5', key: { type: 'digit', digit: 1 } },
    { type: 'calculator', windowId: 'w5', key: { type: 'equals' } },
    { type: 'command', windowId: 'w2', command: 'open' },
    { type: 'settings', windowId: 'w6', action: { type: 'set-brightness', value: 70 } },
    { type: 'settings', windowId: 'w6', action: { type: 'scroll-list', firstRow: 3 } },
    { type: 'set-volume', volume: 40 },
  ];
  return reduceAll(base, actions, { clipboard: createToyClipboard() }).state;
}

type Json = Record<string, unknown>;

function savedText(state: DesktopState): string {
  return JSON.stringify({ version: 1, state });
}

function isJson(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function json(value: unknown, what: string): Json {
  if (!isJson(value)) throw new Error(`no object at ${what}`);
  return value;
}

/** Saved JSON of the busy desktop, changed by `edit`, as a parse result. */
function parseEdited(edit: (state: Json) => void) {
  const document = json(JSON.parse(savedText(busyDesktop())), 'the document');
  edit(json(document.state, 'state'));
  return parseDocument(JSON.stringify(document), desktopDocument);
}

function load(state: DesktopState): DesktopState {
  const result = parseDocument(savedText(state), desktopDocument);
  if (!result.ok) throw new Error(`${result.reason}: ${result.detail}`);
  return result.value.state;
}

// Small accessors into raw saved JSON. Each throws if the fixture shape changed.
function at(value: unknown, ...path: string[]): Json {
  return path.reduce((current, part) => json(json(current, part)[part], path.join('.')), json(value, 'the start'));
}

const nodes = (state: Json) => at(state, 'fs', 'nodes');

function windows(state: Json): Json[] {
  const list = state.windows;
  if (!Array.isArray(list)) throw new Error('no windows');
  return list.map((window, index) => json(window, `window ${index}`));
}

function pathKey(state: Json, name: string): string {
  const entry = Object.entries(nodes(state)).find(([, node]) => json(node, 'a node').name === name);
  if (entry === undefined) throw new Error(`no ${name}`);
  return entry[0];
}

/** The key of the one picture in the busy desktop. */
function pictureKey(state: Json): string {
  const entry = Object.entries(nodes(state)).find(([, node]) => json(node, 'a node').kind === 'picture');
  if (entry === undefined) throw new Error('no picture');
  return entry[0];
}

const firstNoteId = (state: Json) => at(nodes(state), pathKey(state, 'List'));

const noHistory = (editor: TextEditorState): TextEditorState => ({ ...editor, undo: [], redo: [], run: null });

/** What a load should give back: the same desktop with no undo history and the music box stopped. */
function withoutHistory(state: DesktopState): DesktopState {
  const shown = state.windows.map((window): WindowState => {
    const { app } = window;
    const dialog = 'dialog' in app && app.dialog !== null ? { ...app.dialog, name: noHistory(app.dialog.name) } : null;
    switch (app.kind) {
      case 'notepad':
        return { ...window, app: { ...app, editor: noHistory(app.editor), dialog } };
      case 'picture-viewer':
        return { ...window, app: { ...app, dialog } };
      case 'file-explorer': {
        const rename = app.rename === null ? null : { ...app.rename, field: noHistory(app.rename.field) };
        return { ...window, app: { ...app, search: noHistory(app.search), rename } };
      }
      case 'music-box':
        return { ...window, app: { ...app, dialog, playing: false, position: 0, undo: [], redo: [] } };
      case 'settings':
        return { ...window, app: { ...app, nameField: noHistory(app.nameField) } };
      default:
        return window;
    }
  });
  return { ...state, windows: shown };
}

describe('saving and loading the desktop', () => {
  it('gives back the whole desktop, less undo history and playback', () => {
    const busy = busyDesktop();
    expect(load(busy)).toEqual(withoutHistory(busy));
  });

  it('loads the free-play defaults and a busy desktop', () => {
    expect(load(sampleDesktop())).toEqual(sampleDesktop());
    const busy = busyDesktop();
    const loaded = load(busy);
    expect(loaded.fs).toEqual(busy.fs);
    expect(loaded.settings).toEqual(busy.settings);
    expect(loaded.windows.map((window) => window.rect)).toEqual(busy.windows.map((window) => window.rect));
    expect(loaded.windows.map((window) => window.app.kind)).toEqual(busy.windows.map((window) => window.app.kind));
  });

  it('drops undo history and stops playback, which keeps the document small', () => {
    const loaded = load(busyDesktop());
    const notepad = loaded.windows[0]?.app;
    const musicBox = loaded.windows[3]?.app;
    expect(notepad?.kind === 'notepad' && notepad.editor).toMatchObject({ text: 'milk and tea', undo: [], redo: [] });
    expect(musicBox?.kind === 'music-box' && musicBox).toMatchObject({ playing: false, position: 0, undo: [] });
    expect(musicBox?.kind === 'music-box' && musicBox.tune.steps[3]?.[2]).toBe(true);
  });

  it('gives the same desktop after a second save and load', () => {
    const once = load(busyDesktop());
    expect(load(once)).toEqual(once);
  });

  it('turns undefined history from a hand-written file into an empty one', () => {
    const result = parseEdited((state) => {
      delete at(windows(state)[0], 'app', 'editor').undo;
    });
    expect(result.ok).toBe(true);
  });
});

describe('bad saved data', () => {
  it.each<[string, (state: Json) => void, string]>([
    ['a missing file system', (state) => delete state.fs, 'fs'],
    ['a window of an unknown app', (state) => (at(windows(state)[0], 'app').kind = 'game'), 'windows.0.app'],
    [
      'a window rectangle that is not a number',
      (state) => (at(windows(state)[0], 'rect').x = 'left'),
      'windows.0.rect.x',
    ],
    ['an infinite window position', (state) => (at(windows(state)[0], 'rect').y = 1e300), 'windows.0.rect.y'],
    [
      'two windows with one id',
      (state) => (state.windows = windows(state).map((window) => ({ ...window, id: 'w1' }))),
      'window ids must be unique',
    ],
    [
      'too many windows',
      (state) =>
        (state.windows = Array.from({ length: MAX_WINDOWS + 1 }, (_, index) => ({
          ...windows(state)[4],
          id: `w${index + 1}`,
        }))),
      'windows',
    ],
    ['a volume above 100', (state) => (at(state, 'system').volume = 101), 'system.volume'],
    ['a fractional volume', (state) => (at(state, 'system').volume = 4.5), 'system.volume'],
    ['a brightness between slider steps', (state) => (at(state, 'settings').brightness = 75), 'slider step'],
    ['an unknown wallpaper', (state) => (at(state, 'settings').wallpaper = 'beach'), 'settings.wallpaper'],
    [
      'a list scrolled past its end',
      (state) => (at(windows(state)[5], 'app').listScroll = ALERT_SOUNDS.length - LIST_VISIBLE_ROWS + 1),
      'listScroll',
    ],
    ['a calculator display with letters', (state) => (at(windows(state)[4], 'app').display = '4x'), 'display'],
    [
      'a calculator display past the digit limit',
      (state) => (at(windows(state)[4], 'app').display = '12345678901'),
      'too many digits',
    ],
    [
      'a caret past the end of the text',
      (state) => (at(windows(state)[0], 'app', 'editor').caret = 999),
      'selection must be inside',
    ],
    [
      'an anchor past the end of the text',
      (state) => (at(windows(state)[0], 'app', 'editor').anchor = 999),
      'selection must be inside',
    ],
    [
      'a home folder inside another',
      (state) => (at(nodes(state), HOME_ID).parentId = TRASH_ID),
      'home must be a top folder',
    ],
    [
      'a calculator display that starts with a letter',
      (state) => (at(windows(state)[4], 'app').display = 'x4'),
      'display',
    ],
    ['a tune with a missing step', (state) => (at(windows(state)[3], 'app', 'tune').steps = [[false]]), 'tune'],
    [
      'an unknown last command',
      (state) => (state.lastCommand = { command: 'format-disk', app: 'notepad' }),
      'lastCommand',
    ],
    ['a node id that does not match its key', (state) => (firstNoteId(state).id = 'n77'), 'has id n77'],
    ['an item whose folder is missing', (state) => (firstNoteId(state).parentId = 'n999'), 'is not in a folder'],
    ['an item inside a file', (state) => (firstNoteId(state).parentId = pictureKey(state)), 'is not in a folder'],
    ['a missing home folder', (state) => delete nodes(state)[HOME_ID], 'home must be a top folder'],
    [
      'a trash that is a file',
      (state) => (nodes(state)[TRASH_ID] = { ...firstNoteId(state), id: TRASH_ID, parentId: null }),
      'trash must be a top folder',
    ],
    ['a name with a slash', (state) => (firstNoteId(state).name = 'a/b'), 'name rules'],
    ['a name with spaces at the end', (state) => (firstNoteId(state).name = 'List '), 'name rules'],
    [
      'a picture id with spaces',
      (state) => (nodes(state)[pictureKey(state)] = { ...at(nodes(state), pictureKey(state)), pictureId: 'a fox' }),
      'pictureId',
    ],
    [
      'two items with one name in a folder',
      (state) => {
        const fox = at(nodes(state), pictureKey(state));
        fox.name = 'list';
        fox.parentId = firstNoteId(state).parentId;
      },
      'two items named',
    ],
    [
      'a trash place on an item outside the trash',
      (state) => (firstNoteId(state).trashedFrom = HOME_ID),
      'outside the trash',
    ],
    ['an id counter of zero', (state) => (state.nextId = 0), 'nextId'],
  ])('sets aside %s', (_label, edit, detail) => {
    const result = parseEdited(edit);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid');
    expect(result.detail).toContain(detail);
  });

  it('sets aside folders in a loop', () => {
    const result = parseEdited((state) => {
      const all = nodes(state);
      all.na = { id: 'na', name: 'A', parentId: 'nb', trashedFrom: null, kind: 'folder' };
      all.nb = { id: 'nb', name: 'B', parentId: 'na', trashedFrom: null, kind: 'folder' };
    });
    expect(!result.ok && result.detail).toContain('in a loop');
  });

  it(`sets aside more than ${MAX_NODES} items`, () => {
    const result = parseEdited((state) => {
      const all = nodes(state);
      for (let index = 0; index < MAX_NODES; index += 1) {
        all[`x${index}`] = { id: `x${index}`, name: `F${index}`, parentId: HOME_ID, trashedFrom: null, kind: 'folder' };
      }
    });
    expect(!result.ok && result.detail).toContain(`more than ${MAX_NODES} items`);
  });

  it.each([
    ['text that is not JSON', '{"version": 1, "state": ', 'invalid-json'],
    ['a document from a newer app', JSON.stringify({ version: 2, state: {} }), 'future-version'],
    ['a document with no version', JSON.stringify({ state: {} }), 'bad-version'],
    ['a document without state', JSON.stringify({ version: 1 }), 'invalid'],
  ])('sets aside %s', (_label, text, reason) => {
    expect(parseDocument(text, desktopDocument)).toMatchObject({ ok: false, reason });
  });
});

describe('repairs on load', () => {
  it('moves a window back onto a desktop that got smaller', () => {
    const loaded = parseEdited((state) => {
      at(windows(state)[0], 'rect').x = 5000;
      at(state, 'size').width = 10;
    });
    if (!loaded.ok) throw new Error(loaded.detail);
    expect(loaded.value.state.size.width).toBe(1024);
    expect(loaded.value.state.windows[0]?.rect.x).toBeLessThan(1024);
  });

  it('moves focus off a minimized or missing window', () => {
    const minimized = parseEdited((state) => (state.focusedWindowId = 'w5'));
    const missing = parseEdited((state) => (state.focusedWindowId = 'w42'));
    for (const loaded of [minimized, missing]) {
      if (!loaded.ok) throw new Error(loaded.detail);
      expect(loaded.value.state.focusedWindowId).toBe('w6');
    }
  });

  it('raises id counters that would reuse an id', () => {
    const loaded = parseEdited((state) => {
      state.nextId = 1;
      state.nextWindowId = 1;
    });
    if (!loaded.ok) throw new Error(loaded.detail);
    const { nextId, nextWindowId } = loaded.value.state;
    expect(Object.keys(loaded.value.state.fs.nodes)).not.toContain(`n${nextId}`);
    expect(nextWindowId).toBe(7);
  });

  it('sends an explorer showing a missing folder home and drops a stale selection', () => {
    const loaded = parseEdited((state) => {
      const explorer = at(windows(state)[2], 'app');
      explorer.folderId = 'n999';
      explorer.selectedId = 'n998';
      explorer.rename = null;
    });
    if (!loaded.ok) throw new Error(loaded.detail);
    expect(loaded.value.state.windows[2]?.app).toMatchObject({ folderId: HOME_ID, selectedId: null });
  });
});

describe('saved data at the limits', () => {
  it.each([
    ['a calculator showing a negative decimal', (state: Json) => (at(windows(state)[4], 'app').display = '-1.25')],
    ['a calculator in the middle of a decimal', (state: Json) => (at(windows(state)[4], 'app').display = '0.')],
    ['a calculator showing all ten digits', (state: Json) => (at(windows(state)[4], 'app').display = '1234567890')],
    [
      'a calculator showing a divide by zero',
      (state: Json) => (at(windows(state)[4], 'app').problem = 'divide-by-zero'),
    ],
    ['a calculator showing a number too big', (state: Json) => (at(windows(state)[4], 'app').problem = 'too-big')],
    [
      'a list scrolled to its last row',
      (state: Json) => (at(windows(state)[5], 'app').listScroll = ALERT_SOUNDS.length - LIST_VISIBLE_ROWS),
    ],
  ])('loads %s', (_label, edit) => {
    expect(parseEdited(edit).ok).toBe(true);
  });

  it(`loads exactly ${MAX_NODES} items`, () => {
    const result = parseEdited((state) => {
      const all = nodes(state);
      for (let index = Object.keys(all).length; index < MAX_NODES; index += 1) {
        all[`x${index}`] = { id: `x${index}`, name: `F${index}`, parentId: HOME_ID, trashedFrom: null, kind: 'folder' };
      }
    });
    expect(result.ok).toBe(true);
  });

  it('raises a counter past two-digit ids', () => {
    const loaded = parseEdited((state) => (state.nextId = 1));
    if (!loaded.ok) throw new Error(loaded.detail);
    const numbers = Object.keys(loaded.value.state.fs.nodes).map((key) => Number(/^n(\d+)$/.exec(key)?.[1] ?? 0));
    const highest = Math.max(...numbers);
    expect(highest).toBeGreaterThanOrEqual(10);
    expect(loaded.value.state.nextId).toBe(highest + 1);
  });
});
