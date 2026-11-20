import { describe, expect, it } from 'vitest';
import { createToyClipboard } from '../../../app/inputGuards.ts';
import { buildDesktop, note, pathId, picture } from './build.ts';
import {
  explorerItems,
  NEW_FOLDER_NAME,
  reduceAll,
  type DesktopAction,
  type ExplorerAction,
  type Transition,
} from './desktop.ts';
import { getNode, HOME_ID, MAX_NODES, nodeAtPath, TRASH_ID } from './fileSystem.ts';
import { MAX_NAME_LENGTH } from './names.ts';
import { findWindow, type DesktopState, type FileExplorerState } from './state.ts';

const act = (state: DesktopState, ...actions: DesktopAction[]): Transition =>
  reduceAll(state, actions, { clipboard: createToyClipboard() });

const ex = (action: ExplorerAction, windowId = 'w1'): DesktopAction => ({ type: 'explorer', windowId, action });

const run = (command: Extract<DesktopAction, { type: 'command' }>['command'], windowId = 'w1'): DesktopAction => ({
  type: 'command',
  windowId,
  command,
});

const typeInto = (field: 'search' | 'rename', text: string, windowId = 'w1'): DesktopAction[] =>
  Array.from(text, (character) => ({ type: 'text', windowId, field, op: { type: 'insert', text: character } }));

function explorer(state: DesktopState, windowId = 'w1'): FileExplorerState {
  const app = findWindow(state, windowId)?.app;
  if (app?.kind !== 'file-explorer') throw new Error(`${windowId} is not an explorer`);
  return app;
}

const files = {
  Pictures: { Fox: picture('fox'), Trips: { Boat: picture('sailboat') } },
  Notes: { 'Fox facts': note('quick') },
  Toys: {},
};

function start(folder = ''): DesktopState {
  return buildDesktop({ files, windows: [{ app: 'file-explorer', folder }] });
}

describe('browsing', () => {
  it('opens a folder with a single click', () => {
    const state = start();
    const { state: next, events } = act(state, ex({ type: 'open-node', nodeId: pathId(state, 'Pictures') }));
    expect(explorer(next).folderId).toBe(pathId(state, 'Pictures'));
    expect(explorerItems(next.fs, explorer(next)).map((node) => node.name)).toEqual(['Trips', 'Fox']);
    expect(events).toEqual([{ type: 'folder-opened', windowId: 'w1', folderId: pathId(state, 'Pictures') }]);
  });

  it('opens a file in its app', () => {
    const state = start('Pictures');
    const { state: next, events } = act(state, ex({ type: 'open-node', nodeId: pathId(state, 'Pictures/Fox') }));
    expect(next.windows.map((window) => window.app.kind)).toEqual(['file-explorer', 'picture-viewer']);
    expect(events).toContainEqual({ type: 'picture-shown', windowId: 'w2', nodeId: pathId(state, 'Pictures/Fox') });
  });

  it('opens the selected item with the Open command', () => {
    const state = start();
    const { state: next } = act(state, ex({ type: 'select', nodeId: pathId(state, 'Notes') }), run('open'));
    expect(explorer(next).folderId).toBe(pathId(state, 'Notes'));
  });

  it('shows the trash, but not the inside of a deleted folder', () => {
    const state = start();
    const trashed = act(state, ex({ type: 'move', nodeId: pathId(state, 'Pictures'), toId: TRASH_ID })).state;
    const inTrash = act(trashed, ex({ type: 'open-node', nodeId: TRASH_ID })).state;
    expect(explorerItems(inTrash.fs, explorer(inTrash)).map((node) => node.name)).toEqual(['Pictures']);
    expect(act(inTrash, ex({ type: 'open-node', nodeId: pathId(state, 'Pictures') })).events).toEqual([
      { type: 'rejected', action: 'explorer', reason: 'in-trash' },
    ]);
    expect(act(state, ex({ type: 'open-node', nodeId: 'n999' })).events).toEqual([
      { type: 'rejected', action: 'explorer', reason: 'not-found' },
    ]);
  });

  it.each([
    ['a folder to its parent', 'Pictures/Trips', 'Pictures'],
    ['the trash to home', null, ''],
  ])('goes up from %s', (_label, from, to) => {
    const state = from === null ? act(start(), ex({ type: 'open-node', nodeId: TRASH_ID })).state : start(from);
    const { state: next } = act(state, run('go-up'));
    expect(explorer(next).folderId).toBe(pathId(state, to));
  });

  it('cannot go up from home', () => {
    expect(act(start(), run('go-up')).events).toEqual([
      { type: 'rejected', action: 'command', reason: 'command-disabled' },
    ]);
  });

  it('selects an item, reports it, and ignores selecting it again', () => {
    const state = start();
    const notes = pathId(state, 'Notes');
    const { state: next, events } = act(
      state,
      ex({ type: 'select', nodeId: notes }),
      ex({ type: 'select', nodeId: notes }),
    );
    expect(explorer(next).selectedId).toBe(notes);
    expect(events).toEqual([{ type: 'selection-changed', windowId: 'w1', nodeId: notes }]);
    expect(act(state, ex({ type: 'select', nodeId: 'n999' })).events).toEqual([
      { type: 'rejected', action: 'explorer', reason: 'not-found' },
    ]);
  });
});

describe('search', () => {
  it('lists matches from every folder while the search field holds text', () => {
    const state = start('Toys');
    const { state: next } = act(state, ...typeInto('search', 'fox'));
    expect(explorerItems(next.fs, explorer(next)).map((node) => node.name)).toEqual(['Fox facts', 'Fox']);
  });

  it('goes back to the folder when the search is cleared', () => {
    const searched = act(start('Toys'), ...typeInto('search', 'fox')).state;
    const { state, events } = act(searched, ex({ type: 'clear-search' }));
    expect(explorerItems(state.fs, explorer(state))).toEqual([]);
    expect(events).toEqual([{ type: 'text-changed', windowId: 'w1', field: 'search', text: '' }]);
    expect(act(state, ex({ type: 'clear-search' })).events).toEqual([]);
  });

  it('clears the search when a folder opens', () => {
    const state = act(start(), ...typeInto('search', 'trip')).state;
    const opened = act(state, ex({ type: 'open-node', nodeId: pathId(state, 'Pictures/Trips') })).state;
    expect(explorer(opened).search.text).toBe('');
  });
});

describe('making and renaming folders', () => {
  it('makes a new folder and starts naming it with the name selected', () => {
    const state = start();
    const { state: next, events } = act(state, run('new-folder'));
    const made = nodeAtPath(next.fs, NEW_FOLDER_NAME);
    expect(made?.kind).toBe('folder');
    expect(explorer(next).rename).toMatchObject({
      nodeId: made?.id,
      field: { text: NEW_FOLDER_NAME, anchor: 0, caret: 10 },
    });
    expect(events.slice(1)).toEqual([
      { type: 'folder-created', nodeId: made?.id, parentId: HOME_ID, name: NEW_FOLDER_NAME },
      { type: 'rename-started', windowId: 'w1', nodeId: made?.id },
    ]);
  });

  it('names the new folder by typing and confirming', () => {
    const { state, events } = act(
      start(),
      run('new-folder'),
      ...typeInto('rename', 'Games'),
      ex({ type: 'commit-rename' }),
    );
    const games = nodeAtPath(state.fs, 'Games');
    expect(games?.kind).toBe('folder');
    expect(explorer(state).rename).toBeNull();
    expect(events.at(-1)).toEqual({ type: 'node-renamed', nodeId: games?.id, from: NEW_FOLDER_NAME, to: 'Games' });
  });

  it('numbers a second new folder', () => {
    const { state } = act(start(), run('new-folder'), ex({ type: 'commit-rename' }), run('new-folder'));
    expect(nodeAtPath(state.fs, `${NEW_FOLDER_NAME} 2`)?.kind).toBe('folder');
  });

  it('keeps the rename open when the name is taken, and says why', () => {
    const named = act(start(), run('new-folder'), ...typeInto('rename', 'toys')).state;
    const { state, events } = act(named, ex({ type: 'commit-rename' }));
    expect(events).toEqual([{ type: 'rejected', action: 'explorer', reason: 'duplicate' }]);
    expect(explorer(state).rename?.field.text).toBe('toys');
  });

  it('closes the rename without an event when the name stays the same', () => {
    const state = start();
    const { state: next, events } = act(
      state,
      ex({ type: 'start-rename', nodeId: pathId(state, 'Toys') }),
      ex({ type: 'commit-rename' }),
    );
    expect(explorer(next).rename).toBeNull();
    expect(events.map((event) => event.type)).toEqual(['rename-started']);
  });

  it('renames the selected item from the menu and cancels without changes', () => {
    const state = start();
    const toys = pathId(state, 'Toys');
    const { state: next } = act(
      state,
      ex({ type: 'select', nodeId: toys }),
      run('rename'),
      ...typeInto('rename', 'Blocks'),
      ex({ type: 'cancel-rename' }),
    );
    expect(explorer(next).rename).toBeNull();
    expect(getNode(next.fs, toys)?.name).toBe('Toys');
  });

  it('drops an unfinished rename when something else is selected', () => {
    const state = start();
    const renaming = act(state, ex({ type: 'start-rename', nodeId: pathId(state, 'Toys') })).state;
    expect(explorer(act(renaming, ex({ type: 'select', nodeId: pathId(state, 'Notes') })).state).rename).toBeNull();
  });

  it.each([
    ['home', HOME_ID, 'fixed-folder'],
    ['a missing item', 'n999', 'not-found'],
  ])('refuses to rename %s', (_label, nodeId, reason) => {
    expect(act(start(), ex({ type: 'start-rename', nodeId })).events).toEqual([
      { type: 'rejected', action: 'explorer', reason },
    ]);
  });

  it('refuses to rename an item in the trash, or confirm with no rename open', () => {
    const state = start();
    const trashed = act(state, ex({ type: 'move', nodeId: pathId(state, 'Toys'), toId: TRASH_ID })).state;
    expect(act(trashed, ex({ type: 'start-rename', nodeId: pathId(state, 'Toys') })).events[0]).toMatchObject({
      reason: 'in-trash',
    });
    expect(act(state, ex({ type: 'commit-rename' })).events[0]).toMatchObject({ reason: 'no-text-field' });
  });

  it('refuses a new folder inside the trash', () => {
    const inTrash = act(start(), ex({ type: 'open-node', nodeId: TRASH_ID })).state;
    expect(act(inTrash, run('new-folder')).events[0]).toMatchObject({ reason: 'command-disabled' });
  });

  it('clears an active search when making a new folder so the new folder is shown for naming', () => {
    const searched = act(start(), ...typeInto('search', 'fox')).state;
    const { state: next } = act(searched, run('new-folder'));
    expect(explorer(next).search.text).toBe('');
    const made = nodeAtPath(next.fs, NEW_FOLDER_NAME);
    expect(made?.kind).toBe('folder');
    expect(explorer(next).rename?.nodeId).toBe(made?.id);
    expect(explorerItems(next.fs, explorer(next)).some((node) => node.id === made?.id)).toBe(true);
  });
});

describe('moving, deleting, and restoring', () => {
  it('moves a file into a folder', () => {
    const state = start();
    const facts = pathId(state, 'Notes/Fox facts');
    const { state: next, events } = act(state, ex({ type: 'move', nodeId: facts, toId: pathId(state, 'Toys') }));
    expect(nodeAtPath(next.fs, 'Toys/Fox facts')?.id).toBe(facts);
    expect(events).toEqual([
      { type: 'node-moved', nodeId: facts, fromId: pathId(state, 'Notes'), toId: pathId(state, 'Toys') },
    ]);
  });

  it('reports nothing for a drop where the item already is', () => {
    const state = start();
    expect(act(state, ex({ type: 'move', nodeId: pathId(state, 'Toys'), toId: HOME_ID })).events).toEqual([]);
  });

  it('refuses a move into the folder itself', () => {
    const state = start();
    const pictures = pathId(state, 'Pictures');
    expect(act(state, ex({ type: 'move', nodeId: pictures, toId: pathId(state, 'Pictures/Trips') })).events).toEqual([
      { type: 'rejected', action: 'explorer', reason: 'into-itself' },
    ]);
  });

  it('deletes the selected item to the trash', () => {
    const state = start();
    const toys = pathId(state, 'Toys');
    const { state: next, events } = act(state, ex({ type: 'select', nodeId: toys }), run('delete'));
    expect(getNode(next.fs, toys)).toMatchObject({ parentId: TRASH_ID, trashedFrom: HOME_ID });
    expect(explorer(next).selectedId).toBeNull();
    expect(events.at(-1)).toEqual({ type: 'node-trashed', nodeId: toys, fromId: HOME_ID });
  });

  it('deletes by dropping an item on the trash', () => {
    const state = start();
    const toys = pathId(state, 'Toys');
    expect(act(state, ex({ type: 'move', nodeId: toys, toId: TRASH_ID })).events).toEqual([
      { type: 'node-trashed', nodeId: toys, fromId: HOME_ID },
    ]);
  });

  it('restores the selected item from the trash', () => {
    const state = start('Notes');
    const facts = pathId(state, 'Notes/Fox facts');
    const { state: next, events } = act(
      state,
      ex({ type: 'select', nodeId: facts }),
      run('delete'),
      ex({ type: 'open-node', nodeId: TRASH_ID }),
      ex({ type: 'select', nodeId: facts }),
      run('restore'),
    );
    expect(nodeAtPath(next.fs, 'Notes/Fox facts')?.id).toBe(facts);
    expect(events.at(-1)).toEqual({
      type: 'node-restored',
      nodeId: facts,
      toId: pathId(state, 'Notes'),
      renamedTo: null,
    });
  });

  it('names a restored item anew when its name was taken meanwhile', () => {
    const state = start();
    const toys = pathId(state, 'Toys');
    const { events } = act(
      state,
      ex({ type: 'move', nodeId: toys, toId: TRASH_ID }),
      run('new-folder'),
      ...typeInto('rename', 'Toys'),
      ex({ type: 'commit-rename' }),
      ex({ type: 'open-node', nodeId: TRASH_ID }),
      ex({ type: 'select', nodeId: toys }),
      run('restore'),
    );
    expect(events.at(-1)).toEqual({ type: 'node-restored', nodeId: toys, toId: HOME_ID, renamedTo: 'Toys 2' });
  });

  it('refuses restore for an item outside the trash', () => {
    const state = start();
    expect(
      act(state, ex({ type: 'select', nodeId: pathId(state, 'Toys') }), run('restore')).events.at(-1),
    ).toMatchObject({
      reason: 'not-in-trash',
    });
  });

  it('empties the trash and sends an explorer inside a removed folder home', () => {
    const state = buildDesktop({
      files,
      windows: [{ app: 'file-explorer', folder: 'Pictures/Trips' }, { app: 'file-explorer' }],
    });
    const pictures = pathId(state, 'Pictures');
    const trashed = act(state, ex({ type: 'move', nodeId: pictures, toId: TRASH_ID }, 'w2'));
    expect(explorer(trashed.state, 'w1').folderId).toBe(HOME_ID);
    const { state: next, events } = act(trashed.state, run('empty-trash', 'w2'));
    expect(getNode(next.fs, pictures)).toBeUndefined();
    expect(events.at(-1)).toMatchObject({ type: 'trash-emptied', nodeIds: expect.arrayContaining([pictures]) });
    expect(act(next, run('empty-trash', 'w2')).events.at(-1)).toMatchObject({ reason: 'command-disabled' });
  });

  it('clears a selection and a rename of an item another window deleted', () => {
    const state = buildDesktop({ files, windows: [{ app: 'file-explorer' }, { app: 'file-explorer' }] });
    const toys = pathId(state, 'Toys');
    const { state: next } = act(
      state,
      ex({ type: 'start-rename', nodeId: toys }, 'w1'),
      ex({ type: 'move', nodeId: toys, toId: TRASH_ID }, 'w2'),
    );
    expect(explorer(next, 'w1')).toMatchObject({ selectedId: toys, rename: null });
    const emptied = act(next, run('empty-trash', 'w2')).state;
    expect(explorer(emptied, 'w1').selectedId).toBeNull();
  });
});

describe('explorer edges', () => {
  it('stops the search field at the longest name', () => {
    const { state } = act(start(), ...typeInto('search', 'x'.repeat(MAX_NAME_LENGTH + 5)));
    expect(explorer(state).search.text).toHaveLength(MAX_NAME_LENGTH);
  });

  it('shows the folder while the search field holds only spaces', () => {
    const { state } = act(start(), ...typeInto('search', '   '));
    expect(explorerItems(state.fs, explorer(state)).map((node) => node.name)).toEqual(['Notes', 'Pictures', 'Toys']);
  });

  it('clears the selection', () => {
    const state = start();
    const selected = act(state, ex({ type: 'select', nodeId: pathId(state, 'Toys') })).state;
    const { state: next, events } = act(selected, ex({ type: 'select', nodeId: null }));
    expect(explorer(next).selectedId).toBeNull();
    expect(events).toEqual([{ type: 'selection-changed', windowId: 'w1', nodeId: null }]);
  });

  it('refuses to rename the trash', () => {
    expect(act(start(), ex({ type: 'start-rename', nodeId: TRASH_ID })).events[0]).toMatchObject({
      reason: 'fixed-folder',
    });
  });

  it('refuses to delete home or the trash when one is selected', () => {
    const selected = act(start(), ex({ type: 'select', nodeId: TRASH_ID })).state;
    expect(act(selected, run('delete')).events).toEqual([
      { type: 'rejected', action: 'command', reason: 'fixed-folder' },
    ]);
  });

  it('keeps both of two new folders', () => {
    const { state } = act(start(), run('new-folder'), ex({ type: 'commit-rename' }), run('new-folder'));
    expect(folderNames(state)).toEqual([NEW_FOLDER_NAME, `${NEW_FOLDER_NAME} 2`, 'Notes', 'Pictures', 'Toys']);
  });

  it('refuses a new folder when the file system is full', () => {
    const many = Object.fromEntries(Array.from({ length: MAX_NODES - 2 }, (_, index) => [`F${index}`, note()]));
    const state = buildDesktop({ files: many, windows: [{ app: 'file-explorer' }] });
    expect(act(state, run('new-folder')).events).toEqual([{ type: 'rejected', action: 'command', reason: 'full' }]);
  });
});

function folderNames(state: DesktopState): string[] {
  return explorerItems(state.fs, explorer(state))
    .filter((node) => node.kind === 'folder')
    .map((node) => node.name);
}

describe('explorer commands and repairs', () => {
  it('starts a rename from the menu and deletes nothing', () => {
    const state = start();
    const toys = pathId(state, 'Toys');
    const { state: next, events } = act(state, ex({ type: 'select', nodeId: toys }), run('rename'));
    expect(events.at(-1)).toEqual({ type: 'rename-started', windowId: 'w1', nodeId: toys });
    expect(getNode(next.fs, toys)?.parentId).toBe(HOME_ID);
  });

  it('clears the selection after a restore and keeps showing the trash', () => {
    const state = start();
    const toys = pathId(state, 'Toys');
    const { state: next } = act(
      state,
      ex({ type: 'move', nodeId: toys, toId: TRASH_ID }),
      ex({ type: 'open-node', nodeId: TRASH_ID }),
      ex({ type: 'select', nodeId: toys }),
      run('restore'),
    );
    expect(explorer(next)).toMatchObject({ kind: 'file-explorer', folderId: TRASH_ID, selectedId: null });
  });

  it('stays in its folder, or in the trash, when another window changes the files', () => {
    const state = buildDesktop({
      files,
      windows: [{ app: 'file-explorer', folder: 'Pictures' }, { app: 'file-explorer' }, { app: 'file-explorer' }],
    });
    const inTrash = act(state, ex({ type: 'open-node', nodeId: TRASH_ID }, 'w3')).state;
    const { state: next } = act(inTrash, ex({ type: 'move', nodeId: pathId(state, 'Toys'), toId: TRASH_ID }, 'w2'));
    expect(explorer(next, 'w1').folderId).toBe(pathId(state, 'Pictures'));
    expect(explorer(next, 'w3').folderId).toBe(TRASH_ID);
  });

  it('keeps a dialog selection when another window changes unrelated files', () => {
    const state = buildDesktop({ files, windows: [{ app: 'notepad' }, { app: 'file-explorer' }] });
    const chosen = act(
      state,
      { type: 'command', windowId: 'w1', command: 'open' },
      { type: 'dialog', windowId: 'w1', action: { type: 'open-folder', folderId: pathId(state, 'Notes') } },
      { type: 'dialog', windowId: 'w1', action: { type: 'select', nodeId: pathId(state, 'Notes/Fox facts') } },
    ).state;
    const { state: next } = act(chosen, ex({ type: 'move', nodeId: pathId(state, 'Toys'), toId: TRASH_ID }, 'w2'));
    const app = findWindow(next, 'w1')?.app;
    expect(app?.kind === 'notepad' && app.dialog?.selectedId).toBe(pathId(state, 'Notes/Fox facts'));
  });
});
