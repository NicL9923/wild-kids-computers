import { describe, expect, it } from 'vitest';
import { createToyClipboard, type ToyClipboard } from '../../../app/inputGuards.ts';
import { buildDesktop, note, pathId, picture, tune } from './build.ts';
import { reduceAll, type DesktopAction, type DesktopEnv, type Transition } from './desktop.ts';
import { getNode, nodeAtPath, TRASH_ID } from './fileSystem.ts';
import { findWindow, hasUnsavedChanges, type DesktopState, type NotepadState, type WindowState } from './state.ts';

function setup(clipboard: ToyClipboard = createToyClipboard()) {
  const env: DesktopEnv = { clipboard };
  return {
    clipboard,
    act: (state: DesktopState, ...actions: DesktopAction[]): Transition => reduceAll(state, actions, env),
  };
}

function win(state: DesktopState, windowId: string): WindowState {
  const window = findWindow(state, windowId);
  if (window === undefined) throw new Error(`no window ${windowId}`);
  return window;
}

function notepad(state: DesktopState, windowId: string): NotepadState {
  const { app } = win(state, windowId);
  if (app.kind !== 'notepad') throw new Error(`${windowId} is a ${app.kind}`);
  return app;
}

const typing = (windowId: string, text: string, field: 'document' | 'file-name' = 'document'): DesktopAction[] =>
  Array.from(text, (character) => ({ type: 'text', windowId, field, op: { type: 'insert', text: character } }));

const command = (windowId: string, name: Extract<DesktopAction, { type: 'command' }>['command']): DesktopAction => ({
  type: 'command',
  windowId,
  command: name,
});

const dialog = (windowId: string, action: Extract<DesktopAction, { type: 'dialog' }>['action']): DesktopAction => ({
  type: 'dialog',
  windowId,
  action,
});

const files = {
  Notes: { 'Shopping list': note('milk'), Old: { Draft: note('x') } },
  Pictures: { Fox: picture('fox') },
};

describe('the notepad and saving', () => {
  it('types into a note, which then has unsaved changes', () => {
    const { act } = setup();
    const { state, events } = act(buildDesktop({ windows: [{ app: 'notepad' }] }), ...typing('w1', 'hi'));
    expect(notepad(state, 'w1').editor.text).toBe('hi');
    expect(hasUnsavedChanges(notepad(state, 'w1'))).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'text-changed', windowId: 'w1', field: 'document', text: 'hi' });
  });

  it('asks for a name and a place the first time a note is saved', () => {
    const { act } = setup();
    const start = buildDesktop({ files, windows: [{ app: 'notepad', text: 'eggs' }] });
    const { state, events } = act(start, command('w1', 'save'));
    expect(notepad(state, 'w1').dialog).toMatchObject({ mode: 'save-as', name: { text: '' } });
    expect(events).toEqual([
      { type: 'command-run', windowId: 'w1', app: 'notepad', command: 'save' },
      { type: 'dialog-opened', windowId: 'w1', mode: 'save-as' },
    ]);
  });

  it('saves a new note with a name in the folder the child chose', () => {
    const { act } = setup();
    const start = buildDesktop({ files, windows: [{ app: 'notepad', text: 'eggs' }] });
    const { state, events } = act(
      start,
      command('w1', 'save'),
      dialog('w1', { type: 'open-folder', folderId: pathId(start, 'Notes') }),
      ...typing('w1', 'Breakfast', 'file-name'),
      dialog('w1', { type: 'confirm' }),
    );
    const saved = nodeAtPath(state.fs, 'Notes/Breakfast');
    expect(saved).toMatchObject({ kind: 'note', text: 'eggs' });
    expect(notepad(state, 'w1')).toMatchObject({ fileId: saved?.id, dialog: null });
    expect(hasUnsavedChanges(notepad(state, 'w1'))).toBe(false);
    expect(events.slice(-2)).toEqual([
      {
        type: 'file-saved',
        windowId: 'w1',
        nodeId: saved?.id,
        folderId: pathId(start, 'Notes'),
        kind: 'note',
        how: 'new',
      },
      { type: 'dialog-closed', windowId: 'w1' },
    ]);
  });

  it.each([
    ['an empty name', '', 'empty'],
    ['a name with a slash', 'a/b', 'bad-character'],
    ['the name of a folder there', 'Notes', 'duplicate'],
    ['the name of a picture there', 'Pictures', 'duplicate'],
  ])('refuses to save with %s and keeps the dialog open', (_label, name, reason) => {
    const { act } = setup();
    const start = buildDesktop({ files, windows: [{ app: 'notepad', text: 'eggs' }] });
    const asking = act(start, command('w1', 'save-as'), ...typing('w1', name, 'file-name')).state;
    const { state, events } = act(asking, dialog('w1', { type: 'confirm' }));
    expect(events).toEqual([{ type: 'rejected', action: 'dialog', reason }]);
    expect(state).toBe(asking);
  });

  it('asks before saving over another note, then replaces it on a second confirm', () => {
    const { act } = setup();
    const start = buildDesktop({ files, windows: [{ app: 'notepad', text: 'bread' }] });
    const list = pathId(start, 'Notes/Shopping list');
    const named = act(
      start,
      command('w1', 'save-as'),
      dialog('w1', { type: 'open-folder', folderId: pathId(start, 'Notes') }),
      ...typing('w1', 'shopping LIST', 'file-name'),
    ).state;
    const asked = act(named, dialog('w1', { type: 'confirm' }));
    expect(asked.events).toEqual([{ type: 'replace-asked', windowId: 'w1', nodeId: list }]);
    expect(getNode(asked.state.fs, list)).toMatchObject({ text: 'milk' });
    const replaced = act(asked.state, dialog('w1', { type: 'confirm' }));
    expect(getNode(replaced.state.fs, list)).toMatchObject({ text: 'bread', name: 'Shopping list' });
    expect(replaced.events[0]).toMatchObject({ type: 'file-saved', nodeId: list, how: 'replace' });
    expect(notepad(replaced.state, 'w1').fileId).toBe(list);
  });

  it('asks again when the name changes after a replace question', () => {
    const { act } = setup();
    const start = buildDesktop({
      files: { 'A note': note('a'), 'B note': note('b') },
      windows: [{ app: 'notepad', text: 'new' }],
    });
    const asked = act(
      start,
      command('w1', 'save-as'),
      ...typing('w1', 'A note', 'file-name'),
      dialog('w1', { type: 'confirm' }),
    );
    expect(notepad(asked.state, 'w1').dialog?.replaceId).toBe(pathId(start, 'A note'));
    const caretOnly = act(asked.state, {
      type: 'text',
      windowId: 'w1',
      field: 'file-name',
      op: { type: 'move', move: 'left', extend: false },
    });
    expect(notepad(caretOnly.state, 'w1').dialog?.replaceId).toBe(pathId(start, 'A note'));
    const renamed = act(
      caretOnly.state,
      { type: 'text', windowId: 'w1', field: 'file-name', op: { type: 'select', anchor: 0, caret: 6 } },
      ...typing('w1', 'B note', 'file-name'),
    );
    expect(notepad(renamed.state, 'w1').dialog?.replaceId).toBeNull();
    const second = act(renamed.state, dialog('w1', { type: 'confirm' }));
    expect(second.events).toEqual([{ type: 'replace-asked', windowId: 'w1', nodeId: pathId(start, 'B note') }]);
  });

  it('saves over its own file at once when save-as keeps the name', () => {
    const { act } = setup();
    const start = buildDesktop({ files, windows: [{ file: 'Notes/Shopping list' }] });
    const { state, events } = act(
      start,
      ...typing('w1', ', tea'),
      command('w1', 'save-as'),
      dialog('w1', { type: 'confirm' }),
    );
    expect(nodeAtPath(state.fs, 'Notes/Shopping list')).toMatchObject({ text: 'milk, tea' });
    expect(events.find((event) => event.type === 'file-saved')).toMatchObject({ how: 'update' });
  });

  it('starts save-as in the folder of the open file with its name selected', () => {
    const { act } = setup();
    const start = buildDesktop({ files, windows: [{ file: 'Notes/Shopping list' }] });
    const { state } = act(start, command('w1', 'save-as'));
    expect(notepad(state, 'w1').dialog).toMatchObject({
      folderId: pathId(start, 'Notes'),
      name: { text: 'Shopping list', anchor: 0, caret: 13 },
    });
  });

  it('saves changes over the open file', () => {
    const { act } = setup();
    const start = buildDesktop({ files, windows: [{ file: 'Notes/Shopping list' }] });
    const { state, events } = act(start, ...typing('w1', ' and jam'), command('w1', 'save'));
    expect(nodeAtPath(state.fs, 'Notes/Shopping list')).toMatchObject({ text: 'milk and jam' });
    expect(events.at(-1)).toMatchObject({ type: 'file-saved', how: 'update', kind: 'note' });
    expect(hasUnsavedChanges(notepad(state, 'w1'))).toBe(false);
  });

  it('refuses save when nothing changed since the last save', () => {
    const { act } = setup();
    const start = buildDesktop({ files, windows: [{ file: 'Notes/Shopping list' }] });
    const { state, events } = act(start, command('w1', 'save'));
    expect(events).toEqual([{ type: 'rejected', action: 'command', reason: 'command-disabled' }]);
    expect(state.lastCommand).toBeNull();
  });

  it('asks for a new place when the open file went to the trash', () => {
    const { act } = setup();
    const start = buildDesktop({
      files,
      windows: [{ file: 'Notes/Shopping list' }, { app: 'file-explorer', folder: 'Notes' }],
    });
    const list = pathId(start, 'Notes/Shopping list');
    const trashed = act(start, {
      type: 'explorer',
      windowId: 'w2',
      action: { type: 'move', nodeId: list, toId: TRASH_ID },
    }).state;
    const { state, events } = act(trashed, ...typing('w1', '!'), command('w1', 'save'));
    expect(events.at(-1)).toEqual({ type: 'dialog-opened', windowId: 'w1', mode: 'save-as' });
    expect(notepad(state, 'w1').dialog?.folderId).toBe(pathId(start, ''));
  });

  it('takes the name of a note the child picks in the save dialog', () => {
    const { act } = setup();
    const start = buildDesktop({ files, windows: [{ app: 'notepad', text: 'x' }] });
    const { state } = act(
      start,
      command('w1', 'save-as'),
      dialog('w1', { type: 'select', nodeId: pathId(start, 'Notes') }),
      dialog('w1', { type: 'select', nodeId: pathId(start, 'Notes/Shopping list') }),
    );
    expect(notepad(state, 'w1').dialog).toMatchObject({
      selectedId: pathId(start, 'Notes/Shopping list'),
      name: { text: 'Shopping list' },
    });
  });

  it('opens a new notepad window with New', () => {
    const { act } = setup();
    const { state, events } = act(
      buildDesktop({ windows: [{ app: 'notepad', text: 'keep me' }] }),
      command('w1', 'new'),
    );
    expect(state.windows.map((window) => window.app.kind)).toEqual(['notepad', 'notepad']);
    expect(notepad(state, 'w1').editor.text).toBe('keep me');
    expect(events.map((event) => event.type)).toEqual(['command-run', 'window-opened', 'window-focused']);
  });
});

describe('the open dialog', () => {
  it('loads the chosen note into a blank notepad', () => {
    const { act } = setup();
    const start = buildDesktop({ files, windows: [{ app: 'notepad' }] });
    const list = pathId(start, 'Notes/Shopping list');
    const { state, events } = act(
      start,
      command('w1', 'open'),
      dialog('w1', { type: 'open-folder', folderId: pathId(start, 'Notes') }),
      dialog('w1', { type: 'select', nodeId: list }),
      dialog('w1', { type: 'confirm' }),
    );
    expect(state.windows).toHaveLength(1);
    expect(notepad(state, 'w1')).toMatchObject({ fileId: list, editor: { text: 'milk' }, dialog: null });
    expect(events.slice(-2)).toEqual([
      { type: 'dialog-closed', windowId: 'w1' },
      { type: 'file-opened', windowId: 'w1', nodeId: list },
    ]);
  });

  it('opens the note in a new window when this one holds other text', () => {
    const { act } = setup();
    const start = buildDesktop({ files, windows: [{ app: 'notepad', text: 'mine' }] });
    const list = pathId(start, 'Notes/Shopping list');
    const { state } = act(
      start,
      command('w1', 'open'),
      dialog('w1', { type: 'open-folder', folderId: pathId(start, 'Notes') }),
      dialog('w1', { type: 'select', nodeId: list }),
      dialog('w1', { type: 'confirm' }),
    );
    expect(notepad(state, 'w1')).toMatchObject({ editor: { text: 'mine' }, dialog: null });
    expect(state.focusedWindowId).toBe('w2');
    expect(notepad(state, 'w2').fileId).toBe(list);
  });

  it('brings forward the window that already shows the note', () => {
    const { act } = setup();
    const start = buildDesktop({ files, windows: [{ file: 'Notes/Shopping list' }, { app: 'notepad' }] });
    const list = pathId(start, 'Notes/Shopping list');
    const { state } = act(
      start,
      command('w2', 'open'),
      dialog('w2', { type: 'open-folder', folderId: pathId(start, 'Notes') }),
      dialog('w2', { type: 'select', nodeId: list }),
      dialog('w2', { type: 'confirm' }),
    );
    expect(state.windows).toHaveLength(2);
    expect(state.focusedWindowId).toBe('w1');
    expect(notepad(state, 'w2')).toMatchObject({ fileId: null, dialog: null });
  });

  it.each([
    ['with nothing selected', [], 'nothing-selected'],
    ['a picture in the notepad', ['Pictures', 'Pictures/Fox'], 'not-a-file'],
  ])('refuses to open %s', (_label, picks, reason) => {
    const { act } = setup();
    const start = buildDesktop({ files, windows: [{ app: 'notepad' }] });
    const chosen = act(
      start,
      command('w1', 'open'),
      ...picks.map((path) => dialog('w1', { type: 'select', nodeId: pathId(start, path) })),
    ).state;
    expect(act(chosen, dialog('w1', { type: 'confirm' })).events).toEqual([
      { type: 'rejected', action: 'dialog', reason },
    ]);
  });

  it('opens a folder with a single click, goes up, and stops at home', () => {
    const { act } = setup();
    const start = buildDesktop({ files, windows: [{ app: 'notepad' }] });
    const inside = act(
      start,
      command('w1', 'open'),
      dialog('w1', { type: 'select', nodeId: pathId(start, 'Notes') }),
      dialog('w1', { type: 'select', nodeId: pathId(start, 'Notes/Old') }),
    );
    expect(notepad(inside.state, 'w1').dialog?.folderId).toBe(pathId(start, 'Notes/Old'));
    expect(inside.events.at(-1)).toEqual({
      type: 'folder-opened',
      windowId: 'w1',
      folderId: pathId(start, 'Notes/Old'),
    });
    const up = act(inside.state, dialog('w1', { type: 'go-up' }), dialog('w1', { type: 'go-up' }));
    expect(notepad(up.state, 'w1').dialog?.folderId).toBe(pathId(start, ''));
    expect(act(up.state, dialog('w1', { type: 'go-up' })).events).toEqual([]);
  });

  it.each([
    ['the trash', 'trash', 'in-trash'],
    ['a file', 'Pictures/Fox', 'not-a-folder'],
    ['a missing folder', 'missing', 'not-found'],
  ])('refuses to open %s as a dialog folder', (_label, target, reason) => {
    const { act } = setup();
    const start = buildDesktop({ files, windows: [{ app: 'notepad' }] });
    const folderId = target === 'trash' ? TRASH_ID : target === 'missing' ? 'n999' : pathId(start, target);
    const opened = act(start, command('w1', 'open')).state;
    expect(act(opened, dialog('w1', { type: 'open-folder', folderId })).events).toEqual([
      { type: 'rejected', action: 'dialog', reason },
    ]);
  });

  it('refuses to select an item outside the dialog folder', () => {
    const { act } = setup();
    const start = buildDesktop({ files, windows: [{ app: 'notepad' }] });
    const opened = act(start, command('w1', 'open')).state;
    expect(act(opened, dialog('w1', { type: 'select', nodeId: pathId(start, 'Pictures/Fox') })).events).toEqual([
      { type: 'rejected', action: 'dialog', reason: 'not-found' },
    ]);
  });

  it('closes on cancel, and dialog actions need an open dialog', () => {
    const { act } = setup();
    const start = buildDesktop({ windows: [{ app: 'notepad' }] });
    const cancelled = act(start, command('w1', 'open'), dialog('w1', { type: 'cancel' }));
    expect(notepad(cancelled.state, 'w1').dialog).toBeNull();
    expect(cancelled.events.at(-1)).toEqual({ type: 'dialog-closed', windowId: 'w1' });
    expect(act(cancelled.state, dialog('w1', { type: 'confirm' })).events).toEqual([
      { type: 'rejected', action: 'dialog', reason: 'no-dialog' },
    ]);
  });

  it('turns off the other file commands while a dialog is open', () => {
    const { act } = setup();
    const opened = act(buildDesktop({ windows: [{ app: 'notepad', text: 'x' }] }), command('w1', 'open')).state;
    expect(act(opened, command('w1', 'save')).events).toEqual([
      { type: 'rejected', action: 'command', reason: 'command-disabled' },
    ]);
    expect(act(opened, command('w1', 'close')).state.windows).toEqual([]);
  });
});

describe('commands and the toy clipboard', () => {
  it('records the last command run and in which app', () => {
    const { act } = setup();
    const { state, events } = act(
      buildDesktop({ windows: [{ app: 'notepad', text: 'hello' }] }),
      command('w1', 'select-all'),
    );
    expect(state.lastCommand).toEqual({ command: 'select-all', app: 'notepad' });
    expect(notepad(state, 'w1').editor).toMatchObject({ anchor: 0, caret: 5 });
    expect(events).toEqual([{ type: 'command-run', windowId: 'w1', app: 'notepad', command: 'select-all' }]);
  });

  it('refuses a command the app does not have', () => {
    const { act } = setup();
    expect(act(buildDesktop({ windows: [{ app: 'calculator' }] }), command('w1', 'save')).events).toEqual([
      { type: 'rejected', action: 'command', reason: 'command-disabled' },
    ]);
  });

  it('moves text from a notepad to the calculator and back', () => {
    const { act, clipboard } = setup();
    const start = buildDesktop({ windows: [{ app: 'notepad', text: '42' }, { app: 'calculator' }] });
    const copied = act(start, command('w1', 'select-all'), command('w1', 'copy'));
    expect(copied.events.at(-1)).toEqual({ type: 'copied', windowId: 'w1', text: '42' });
    const pasted = act(copied.state, command('w2', 'paste'));
    expect(pasted.state.windows[1]?.app).toMatchObject({ kind: 'calculator', display: '42' });
    expect(pasted.events.slice(1)).toEqual([
      { type: 'pasted', windowId: 'w2', text: '42' },
      { type: 'calculator-changed', windowId: 'w2', display: '42', problem: null },
    ]);
    const doubled = act(
      pasted.state,
      { type: 'calculator', windowId: 'w2', key: { type: 'operator', operator: 'multiply' } },
      { type: 'calculator', windowId: 'w2', key: { type: 'digit', digit: 2 } },
      { type: 'calculator', windowId: 'w2', key: { type: 'equals' } },
      command('w2', 'copy'),
    );
    expect(clipboard.read()?.text).toBe('84');
    const back = act(
      doubled.state,
      { type: 'text', windowId: 'w1', field: 'document', op: { type: 'move', move: 'text-end', extend: false } },
      command('w1', 'paste'),
    );
    expect(notepad(back.state, 'w1').editor.text).toBe('4284');
  });

  it('refuses to paste words into the calculator', () => {
    const { act, clipboard } = setup();
    clipboard.write({ kind: 'text', text: 'fox' });
    expect(act(buildDesktop({ windows: [{ app: 'calculator' }] }), command('w1', 'paste')).events).toEqual([
      { type: 'rejected', action: 'command', reason: 'command-disabled' },
    ]);
  });

  it('cuts text and undoes and redoes through the menu', () => {
    const { act, clipboard } = setup();
    const start = buildDesktop({ windows: [{ app: 'notepad', text: 'red fox' }] });
    const cut = act(
      start,
      { type: 'text', windowId: 'w1', field: 'document', op: { type: 'select', anchor: 0, caret: 4 } },
      command('w1', 'cut'),
    );
    expect(notepad(cut.state, 'w1').editor.text).toBe('fox');
    expect(clipboard.read()?.text).toBe('red ');
    expect(cut.events).toContainEqual({ type: 'cut', windowId: 'w1', text: 'red ' });
    const undone = act(cut.state, command('w1', 'undo'));
    expect(notepad(undone.state, 'w1').editor.text).toBe('red fox');
    expect(undone.events).toContainEqual({ type: 'undone', windowId: 'w1' });
    const redone = act(undone.state, command('w1', 'redo'));
    expect(notepad(redone.state, 'w1').editor.text).toBe('fox');
    expect(redone.events).toContainEqual({ type: 'redone', windowId: 'w1' });
  });

  it('refuses a text action for a field the window does not have', () => {
    const { act } = setup();
    expect(
      act(buildDesktop({ windows: [{ app: 'notepad' }] }), {
        type: 'text',
        windowId: 'w1',
        field: 'search',
        op: { type: 'insert', text: 'a' },
      }).events,
    ).toEqual([{ type: 'rejected', action: 'text', reason: 'no-text-field' }]);
  });
});

describe('opening files', () => {
  it.each([
    ['a note in the notepad', 'Notes/Shopping list', 'notepad'],
    ['a picture in the viewer', 'Pictures/Fox', 'picture-viewer'],
    ['a tune in the music box', 'Song', 'music-box'],
  ])('opens %s', (_label, path, app) => {
    const { act } = setup();
    const start = buildDesktop({ files: { ...files, Song: tune([[0, 0]]) } });
    const { state, events } = act(start, { type: 'open-file', fileId: pathId(start, path) });
    expect(state.windows[0]?.app.kind).toBe(app);
    expect(events).toContainEqual({ type: 'file-opened', windowId: 'w1', nodeId: pathId(start, path) });
  });

  it('brings forward a window that already shows the file, restoring it', () => {
    const { act } = setup();
    const start = buildDesktop({ files, windows: [{ file: 'Pictures/Fox', minimized: true }, { app: 'calculator' }] });
    const { state, events } = act(start, { type: 'open-file', fileId: pathId(start, 'Pictures/Fox') });
    expect(state.windows).toHaveLength(2);
    expect(state.focusedWindowId).toBe('w1');
    expect(events.map((event) => event.type)).toEqual(['window-restored', 'window-focused']);
  });

  it.each([
    ['a folder', 'Notes', 'not-a-file'],
    ['a missing file', null, 'not-found'],
  ])('refuses to open %s', (_label, path, reason) => {
    const { act } = setup();
    const start = buildDesktop({ files });
    const fileId = path === null ? 'n999' : pathId(start, path);
    expect(act(start, { type: 'open-file', fileId }).events).toEqual([
      { type: 'rejected', action: 'open-file', reason },
    ]);
  });

  it('refuses to open a file in the trash', () => {
    const { act } = setup();
    const start = buildDesktop({ trash: { Old: { from: '', item: note('gone') } } });
    const old = Object.values(start.fs.nodes).find((node) => node.name === 'Old');
    expect(act(start, { type: 'open-file', fileId: old?.id ?? '' }).events).toEqual([
      { type: 'rejected', action: 'open-file', reason: 'in-trash' },
    ]);
  });
});

describe('the picture viewer', () => {
  const pictures = {
    Pictures: { Ant: picture('ant'), Bee: picture('bee'), Cow: picture('cow'), Notes: note() },
    Lone: { Dog: picture('dog') },
  };

  it('steps to the next and previous picture in the folder, wrapping around', () => {
    const { act } = setup();
    const start = buildDesktop({ files: pictures, windows: [{ file: 'Pictures/Cow' }] });
    const next = act(start, command('w1', 'next'));
    expect(next.events.at(-1)).toEqual({
      type: 'picture-shown',
      windowId: 'w1',
      nodeId: pathId(start, 'Pictures/Ant'),
    });
    const back = act(next.state, command('w1', 'previous'), command('w1', 'previous'));
    expect(back.events.at(-1)).toEqual({
      type: 'picture-shown',
      windowId: 'w1',
      nodeId: pathId(start, 'Pictures/Bee'),
    });
  });

  it('has no next or previous for a picture alone in its folder, or no picture', () => {
    const { act } = setup();
    const start = buildDesktop({ files: pictures, windows: [{ file: 'Lone/Dog' }, { app: 'picture-viewer' }] });
    for (const windowId of ['w1', 'w2']) {
      expect(act(start, command(windowId, 'next')).events).toEqual([
        { type: 'rejected', action: 'command', reason: 'command-disabled' },
      ]);
    }
  });
});

const box = () => buildDesktop({ windows: [{ app: 'music-box' }] });
const toggle = (step: number, row: number): DesktopAction => ({
  type: 'music-box',
  windowId: 'w1',
  action: { type: 'toggle', step, note: row },
});

describe('the music box', () => {
  it('toggles notes and reports each change', () => {
    const { act } = setup();
    const { events } = act(box(), toggle(1, 2), toggle(1, 2));
    expect(events).toEqual([
      { type: 'note-toggled', windowId: 'w1', step: 1, note: 2, on: true },
      { type: 'note-toggled', windowId: 'w1', step: 1, note: 2, on: false },
    ]);
  });

  it('refuses a note outside the grid', () => {
    const { act } = setup();
    expect(act(box(), toggle(99, 0)).events).toEqual([
      { type: 'rejected', action: 'music-box', reason: 'not-an-option' },
    ]);
  });

  it('plays the notes of each step as the screen ticks, then stops', () => {
    const { act } = setup();
    const tick: DesktopAction = { type: 'music-box', windowId: 'w1', action: { type: 'tick' } };
    const played = act(box(), toggle(0, 1), toggle(1, 3), command('w1', 'play'), tick);
    expect(played.events.slice(-3)).toEqual([
      { type: 'playback-changed', windowId: 'w1', playing: true },
      { type: 'step-played', windowId: 'w1', step: 0, notes: [1] },
      { type: 'step-played', windowId: 'w1', step: 1, notes: [3] },
    ]);
    const stopped = act(played.state, command('w1', 'stop'), tick);
    expect(stopped.events.slice(1)).toEqual([{ type: 'playback-changed', windowId: 'w1', playing: false }]);
  });

  it('saves a tune as a tune file and undoes a note', () => {
    const { act } = setup();
    const { state } = act(
      box(),
      toggle(0, 0),
      toggle(2, 4),
      command('w1', 'undo'),
      command('w1', 'save'),
      ...typing('w1', 'Song', 'file-name'),
      dialog('w1', { type: 'confirm' }),
    );
    const saved = nodeAtPath(state.fs, 'Song');
    expect(saved?.kind).toBe('tune');
    expect(saved?.kind === 'tune' && saved.tune.steps[0]?.[0]).toBe(true);
    expect(saved?.kind === 'tune' && saved.tune.steps[2]?.[4]).toBe(false);
    expect(hasUnsavedChanges(win(state, 'w1').app)).toBe(false);
  });

  it('clears the grid from the menu', () => {
    const { act } = setup();
    const { events } = act(box(), toggle(0, 0), command('w1', 'clear'));
    expect(events.at(-1)).toEqual({ type: 'tune-cleared', windowId: 'w1' });
  });
});

describe('the calculator and settings through the desktop', () => {
  it('reports what the calculator shows after each key', () => {
    const { act } = setup();
    const start = buildDesktop({ windows: [{ app: 'calculator' }] });
    const { events } = act(start, { type: 'calculator', windowId: 'w1', key: { type: 'digit', digit: 7 } });
    expect(events).toEqual([{ type: 'calculator-changed', windowId: 'w1', display: '7', problem: null }]);
  });

  it('reports nothing for a key that changes nothing', () => {
    const { act } = setup();
    const start = buildDesktop({ windows: [{ app: 'calculator' }] });
    expect(act(start, { type: 'calculator', windowId: 'w1', key: { type: 'backspace' } }).events).toEqual([]);
  });

  it.each([
    ['a calculator key to a notepad', { type: 'calculator', windowId: 'w1', key: { type: 'clear' } }],
    ['a music box action to a notepad', { type: 'music-box', windowId: 'w1', action: { type: 'tick' } }],
    ['a settings action to a notepad', { type: 'settings', windowId: 'w1', action: { type: 'open-dropdown' } }],
    ['an explorer action to a notepad', { type: 'explorer', windowId: 'w1', action: { type: 'clear-search' } }],
  ] as const)('refuses %s', (_label, action) => {
    const { act } = setup();
    expect(act(buildDesktop({ windows: [{ app: 'notepad' }] }), action).events).toEqual([
      { type: 'rejected', action: action.type, reason: 'wrong-app' },
    ]);
  });

  it('changes desktop settings from the settings panel', () => {
    const { act } = setup();
    const start = buildDesktop({ windows: [{ app: 'settings' }] });
    const { state, events } = act(start, {
      type: 'settings',
      windowId: 'w1',
      action: { type: 'set-wallpaper', value: 'pond' },
    });
    expect(state.settings.wallpaper).toBe('pond');
    expect(events).toEqual([{ type: 'setting-changed', setting: 'wallpaper', value: 'pond' }]);
  });

  it('refuses a settings value that is not an option', () => {
    const { act } = setup();
    const start = buildDesktop({ windows: [{ app: 'settings' }] });
    expect(
      act(start, { type: 'settings', windowId: 'w1', action: { type: 'set-icon-size', value: 'giant' } }).events,
    ).toEqual([{ type: 'rejected', action: 'settings', reason: 'not-an-option' }]);
  });

  it('names the computer through the text field', () => {
    const { act } = setup();
    const start = buildDesktop({ windows: [{ app: 'settings' }] });
    const { state, events } = act(start, command('w1', 'select-all'), {
      type: 'text',
      windowId: 'w1',
      field: 'computer-name',
      op: { type: 'insert', text: 'Z' },
    });
    expect(state.settings.computerName).toBe('Z');
    expect(events.at(-1)).toEqual({ type: 'setting-changed', setting: 'computerName', value: 'Z' });
  });
});
