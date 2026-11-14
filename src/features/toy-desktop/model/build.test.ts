import { describe, expect, it } from 'vitest';
import { createToyClipboard } from '../../../app/inputGuards.ts';
import { buildDesktop, emptyDesktop, note, pathId, picture, tune, type DesktopSpec } from './build.ts';
import { reduce, reduceAll, type DesktopAction } from './desktop.ts';
import { getNode, HOME_ID, listFolder, TRASH_ID } from './fileSystem.ts';
import { DEFAULT_DESKTOP_SIZE, MIN_VISIBLE_TITLE_BAR } from './geometry.ts';
import {
  fileExists,
  folderExists,
  hasEvent,
  isAppFocused,
  isAppOpen,
  isInFolder,
  isInTrash,
  isWindowFocused,
  isWindowMaximized,
  isWindowMinimized,
  isWindowOpen,
  lastCommandWas,
  noteContains,
  windowsOf,
  windowWithFile,
} from './goals.ts';
import { SAMPLE_PICTURE_IDS, sampleDesktop } from './sampleContent.ts';

const env = () => ({ clipboard: createToyClipboard() });

describe('buildDesktop', () => {
  it('builds an empty desktop by default', () => {
    expect(buildDesktop()).toEqual(emptyDesktop());
    expect(emptyDesktop().size).toEqual(DEFAULT_DESKTOP_SIZE);
  });

  it('builds folders and files from a tree', () => {
    const state = buildDesktop({
      files: { Pictures: { Fox: picture('fox'), Trips: {} }, List: note('milk'), Hum: tune([[1, 2]]) },
    });
    expect(getNode(state.fs, pathId(state, 'Pictures/Fox'))).toMatchObject({ kind: 'picture', pictureId: 'fox' });
    expect(getNode(state.fs, pathId(state, 'Pictures/Trips'))?.kind).toBe('folder');
    expect(getNode(state.fs, pathId(state, 'List'))).toMatchObject({ kind: 'note', text: 'milk' });
    const hum = getNode(state.fs, pathId(state, 'Hum'));
    expect(hum?.kind === 'tune' && hum.tune.steps[1]?.[2]).toBe(true);
  });

  it('puts trash items in the trash, remembering where they came from', () => {
    const state = buildDesktop({ files: { Notes: {} }, trash: { Old: { from: 'Notes', item: { Inside: note() } } } });
    const [old] = listFolder(state.fs, TRASH_ID);
    expect(old).toMatchObject({ name: 'Old', kind: 'folder', trashedFrom: pathId(state, 'Notes') });
    expect(listFolder(state.fs, old?.id ?? '').map((node) => node.name)).toEqual(['Inside']);
  });

  it('opens windows in order with their text, folder, place, and state', () => {
    const state = buildDesktop({
      files: { Notes: { List: note('milk') } },
      windows: [
        { app: 'notepad', text: 'draft', at: { x: 300, y: 200 }, size: { width: 400, height: 300 } },
        { app: 'file-explorer', folder: 'Notes', maximized: true },
        { file: 'Notes/List', minimized: true },
      ],
    });
    expect(state.windows.map((window) => window.id)).toEqual(['w1', 'w2', 'w3']);
    expect(state.windows[0]).toMatchObject({
      rect: { x: 300, y: 200, width: 400, height: 300 },
      app: { editor: { text: 'draft' } },
    });
    expect(state.windows[1]).toMatchObject({ maximized: true, app: { folderId: pathId(state, 'Notes') } });
    expect(state.windows[2]).toMatchObject({ minimized: true, app: { fileId: pathId(state, 'Notes/List') } });
    expect(state.focusedWindowId).toBe('w2');
  });

  it('focuses the chosen window and brings it to the front', () => {
    const state = buildDesktop({ windows: [{ app: 'notepad' }, { app: 'calculator' }], focus: 0 });
    expect(state.focusedWindowId).toBe('w1');
    expect(state.windows.map((window) => window.id)).toEqual(['w2', 'w1']);
  });

  it('keeps a window placed by the builder reachable', () => {
    const state = buildDesktop({ windows: [{ app: 'notepad', at: { x: -9000, y: -50 } }] });
    const rect = state.windows[0]?.rect;
    expect((rect?.x ?? 0) + (rect?.width ?? 0)).toBe(MIN_VISIBLE_TITLE_BAR);
    expect(rect?.y).toBe(0);
  });

  it('sets sound and settings', () => {
    const state = buildDesktop({ system: { muted: true }, settings: { wallpaper: 'pond' } });
    expect(state.system).toEqual({ volume: 80, muted: true });
    expect(state.settings.wallpaper).toBe('pond');
  });

  it.each<[string, DesktopSpec, string]>([
    ['a duplicate name', { files: { Notes: {}, notes: note() } }, 'cannot add "notes": duplicate'],
    ['a bad name', { files: { 'a/b': note() } }, 'bad-character'],
    ['a window for a missing file', { windows: [{ file: 'Nope' }] }, 'nothing at "Nope"'],
    [
      'an explorer in a file',
      { files: { List: note() }, windows: [{ app: 'file-explorer', folder: 'List' }] },
      '"List" is not a folder',
    ],
    ['trash from a missing folder', { trash: { Old: { from: 'Gone', item: note() } } }, 'nothing at "Gone"'],
    [
      'focus on a minimized window',
      { windows: [{ app: 'notepad', minimized: true }], focus: 0 },
      'must be open and not minimized',
    ],
    ['focus on a window that does not exist', { windows: [{ app: 'notepad' }], focus: 3 }, 'no window 3'],
    ['too many windows', { windows: Array.from({ length: 9 }, () => ({ app: 'calculator' })) }, 'too-many-windows'],
  ])('throws for %s', (_label, spec, message) => {
    expect(() => buildDesktop(spec)).toThrow(message);
  });
});

describe('sample content', () => {
  it('has the free-play folders, every sample picture, and no windows', () => {
    const state = sampleDesktop();
    expect(listFolder(state.fs, HOME_ID).map((node) => node.name)).toEqual([
      'Music',
      'Notes',
      'Pictures',
      'Butterfly',
      'Tractor',
    ]);
    const pictureIds = Object.values(state.fs.nodes).flatMap((node) =>
      node.kind === 'picture' ? [node.pictureId] : [],
    );
    expect(pictureIds.toSorted()).toEqual([...SAMPLE_PICTURE_IDS].toSorted());
    expect(state.windows).toEqual([]);
  });
});

describe('goal checks', () => {
  const state = buildDesktop({
    files: { Notes: { List: note('Milk and eggs') }, Pictures: { Fox: picture('fox') } },
    trash: { Old: { from: 'Notes', item: note() } },
    windows: [
      { file: 'Notes/List' },
      { app: 'calculator', minimized: true },
      { app: 'notepad', text: 'A big Tree' },
      { app: 'settings', maximized: true },
    ],
    focus: 2,
  });

  it('checks windows', () => {
    expect(isAppOpen(state, 'calculator')).toBe(true);
    expect(isAppOpen(state, 'music-box')).toBe(false);
    expect(windowsOf(state, 'notepad').map((window) => window.id)).toEqual(['w1', 'w3']);
    expect(isWindowOpen(state, 'w2')).toBe(true);
    expect(isWindowOpen(state, 'w9')).toBe(false);
    expect(isAppFocused(state, 'notepad')).toBe(true);
    expect(isAppFocused(state, 'settings')).toBe(false);
    expect(isWindowFocused(state, 'w3')).toBe(true);
    expect(isWindowFocused(state, 'w1')).toBe(false);
    expect(isWindowMinimized(state, 'w2')).toBe(true);
    expect(isWindowMinimized(state, 'w1')).toBe(false);
    expect(isWindowMaximized(state, 'w4')).toBe(true);
    expect(isWindowMaximized(state, 'w1')).toBe(false);
    expect(windowWithFile(state, 'Notes/List')?.id).toBe('w1');
    expect(windowWithFile(state, 'Pictures/Fox')).toBeUndefined();
    expect(windowWithFile(state, 'Nowhere')).toBeUndefined();
  });

  it('does not count a minimized window as maximized', () => {
    const minimized = buildDesktop({ windows: [{ app: 'notepad', maximized: true, minimized: true }] });
    expect(isWindowMaximized(minimized, 'w1')).toBe(false);
  });

  it('checks files and folders', () => {
    expect(isInFolder(state, 'list', 'notes')).toBe(true);
    expect(isInFolder(state, 'Fox', 'Notes')).toBe(false);
    expect(isInFolder(state, 'Fox', 'Pictures/Fox')).toBe(false);
    expect(isInFolder(state, 'Notes', '')).toBe(true);
    expect(isInFolder(state, 'List', 'Nowhere')).toBe(false);
    expect(folderExists(state, 'Pictures')).toBe(true);
    expect(folderExists(state, 'Pictures/Fox')).toBe(false);
    expect(folderExists(state, 'Games')).toBe(false);
    expect(isInTrash(state, 'old')).toBe(true);
    expect(isInTrash(state, 'List')).toBe(false);
    expect(fileExists(state, 'fox')).toBe(true);
    expect(fileExists(state, 'Old')).toBe(false);
    expect(fileExists(state, 'Notes')).toBe(false);
  });

  it('does not count a file inside a deleted folder as existing', () => {
    const deleted = buildDesktop({ trash: { Box: { from: '', item: { Inside: note() } } } });
    expect(fileExists(deleted, 'Inside')).toBe(false);
  });

  it('checks note text, open or saved, ignoring case', () => {
    expect(noteContains(state, 'big tree')).toBe(true);
    expect(noteContains(state, 'MILK')).toBe(true);
    expect(noteContains(state, 'tractor')).toBe(false);
    expect(noteContains(state, 'eggs', { file: 'Notes/List' })).toBe(true);
    expect(noteContains(state, 'tree', { file: 'Notes/List' })).toBe(false);
    expect(noteContains(state, 'fox', { file: 'Pictures/Fox' })).toBe(false);
  });

  it('checks a saved note only after it is saved', () => {
    const actions: DesktopAction[] = [
      { type: 'text', windowId: 'w1', field: 'document', op: { type: 'insert', text: ' and jam' } },
    ];
    const typed = reduceAll(state, actions, env()).state;
    expect(noteContains(typed, 'jam', { file: 'Notes/List' })).toBe(false);
    const saved = reduce(typed, { type: 'command', windowId: 'w1', command: 'save' }, env()).state;
    expect(noteContains(saved, 'jam', { file: 'Notes/List' })).toBe(true);
  });

  it('checks the last command and the events of a transition', () => {
    const { state: next, events } = reduce(state, { type: 'command', windowId: 'w3', command: 'select-all' }, env());
    expect(lastCommandWas(next, 'select-all')).toBe(true);
    expect(lastCommandWas(next, 'select-all', 'notepad')).toBe(true);
    expect(lastCommandWas(next, 'select-all', 'settings')).toBe(false);
    expect(lastCommandWas(next, 'copy')).toBe(false);
    expect(lastCommandWas(state, 'select-all')).toBe(false);
    expect(hasEvent(events, 'command-run')).toBe(true);
    expect(hasEvent(events, 'command-run', (event) => event.command === 'select-all')).toBe(true);
    expect(hasEvent(events, 'command-run', (event) => event.command === 'copy')).toBe(false);
    expect(hasEvent(events, 'window-closed')).toBe(false);
  });
});

describe('builder details', () => {
  it('makes an empty note and an empty tune by default', () => {
    expect(note()).toEqual({ kind: 'note', text: '' });
    const empty = tune();
    expect(empty.kind === 'tune' && empty.tune.steps.flat().some(Boolean)).toBe(false);
  });

  it('keeps line breaks in a builder notepad', () => {
    const state = buildDesktop({ windows: [{ app: 'notepad', text: 'one\ntwo' }] });
    expect(state.windows[0]?.app).toMatchObject({ editor: { text: 'one\ntwo' } });
  });

  it('treats a folder holding an item named "kind" as a folder', () => {
    const state = buildDesktop({ files: { Box: { kind: note('x') } } });
    expect(getNode(state.fs, pathId(state, 'Box'))?.kind).toBe('folder');
    expect(getNode(state.fs, pathId(state, 'Box/kind'))?.kind).toBe('note');
  });
});

describe('more goal checks', () => {
  it('finds a name among several items in the trash', () => {
    const state = buildDesktop({ trash: { A: { from: '', item: note() }, B: { from: '', item: note() } } });
    expect(isInTrash(state, 'b')).toBe(true);
    expect(isInTrash(state, 'C')).toBe(false);
  });

  it('ignores spaces around the text a note should contain, and a missing note', () => {
    const state = buildDesktop({ files: { List: note('big tree') }, windows: [{ app: 'notepad', text: 'red fox' }] });
    expect(noteContains(state, '  red fox ')).toBe(true);
    expect(noteContains(state, ' tree ', { file: 'List' })).toBe(true);
    expect(noteContains(state, 'tree', { file: 'Nowhere' })).toBe(false);
  });
});
