import { describe, expect, it } from 'vitest';
import { buildDesktop, note, picture, tune } from './build.ts';
import {
  createFolder,
  createUntitledFolder,
  emptyTrash,
  filesOfKind,
  getNode,
  HOME_ID,
  isTrashed,
  listFolder,
  MAX_NODES,
  moveNode,
  nodeAtPath,
  overwriteFile,
  pathOf,
  renameNode,
  restoreNode,
  saveNewFile,
  searchByName,
  trashNode,
  TRASH_ID,
  type FileSystem,
  type FsResult,
} from './fileSystem.ts';

function sample(): FileSystem {
  return buildDesktop({
    files: {
      Pictures: { Fox: picture('fox'), Owl: picture('owl'), Trips: { Boat: picture('sailboat') } },
      Notes: { 'Shopping list': note('milk') },
      Music: {},
      'fox facts': note('Foxes are quick.'),
    },
  }).fs;
}

function id(fs: FileSystem, path: string): string {
  const node = nodeAtPath(fs, path);
  if (node === undefined) throw new Error(`no ${path}`);
  return node.id;
}

function ok<T>(result: FsResult<T>): FileSystem {
  if (!result.ok) throw new Error(`expected ok, got ${result.problem}`);
  return result.fs;
}

function names(fs: FileSystem, folderId: string): string[] {
  return listFolder(fs, folderId).map((node) => node.name);
}

describe('reading', () => {
  it('lists folders first, then files, each by name with numbers in order', () => {
    const fs = buildDesktop({
      files: { b: note(), 'Item 10': note(), 'Item 9': note(), Zebra: {}, apple: {} },
    }).fs;
    expect(names(fs, HOME_ID)).toEqual(['apple', 'Zebra', 'b', 'Item 9', 'Item 10']);
  });

  it('finds an item by path, ignoring case and stray slashes', () => {
    const fs = sample();
    expect(nodeAtPath(fs, 'pictures/TRIPS/boat')?.name).toBe('Boat');
    expect(nodeAtPath(fs, '/Pictures//Fox/')?.name).toBe('Fox');
    expect(nodeAtPath(fs, '')?.id).toBe(HOME_ID);
    expect(nodeAtPath(fs, 'Pictures/Cat')).toBeUndefined();
    expect(nodeAtPath(fs, 'Pictures/Fox/Inside')).toBeUndefined();
  });

  it('gives each item its path under home', () => {
    const fs = sample();
    expect(pathOf(fs, id(fs, 'Pictures/Trips/Boat'))).toBe('Pictures/Trips/Boat');
    expect(pathOf(fs, HOME_ID)).toBe('');
  });

  it('lists the files of one kind in a folder', () => {
    const fs = buildDesktop({ files: { Mixed: { A: picture('a'), B: note(), C: picture('c'), D: {} } } }).fs;
    expect(filesOfKind(fs, id(fs, 'Mixed'), 'picture').map((node) => node.name)).toEqual(['A', 'C']);
  });
});

describe('createFolder', () => {
  it('adds a folder with a trimmed name', () => {
    const fs = ok(createFolder(sample(), HOME_ID, '  Games ', 'n-new'));
    expect(getNode(fs, 'n-new')).toMatchObject({ name: 'Games', parentId: HOME_ID, kind: 'folder' });
  });

  it.each([
    ['a name already used in the folder', HOME_ID, 'notes', 'duplicate'],
    ['an empty name', HOME_ID, ' ', 'empty'],
    ['a missing parent', 'n999', 'Games', 'not-found'],
    ['a file as the parent', 'file', 'Games', 'not-a-folder'],
    ['the trash as the parent', TRASH_ID, 'Games', 'in-trash'],
  ])('refuses %s', (_label, parent, name, problem) => {
    const fs = sample();
    const parentId = parent === 'file' ? id(fs, 'fox facts') : parent;
    expect(createFolder(fs, parentId, name, 'n-new')).toEqual({ ok: false, problem });
  });

  it('refuses a folder inside a folder in the trash', () => {
    const fs = ok(trashNode(sample(), id(sample(), 'Pictures')));
    expect(createFolder(fs, id(sample(), 'Pictures/Trips'), 'Games', 'n-new')).toEqual({
      ok: false,
      problem: 'in-trash',
    });
  });

  it('refuses a new item once the file system is full', () => {
    let fs = buildDesktop().fs;
    for (let index = Object.keys(fs.nodes).length; index < MAX_NODES; index += 1) {
      fs = ok(createFolder(fs, HOME_ID, `Folder ${index}`, `n${index}`));
    }
    expect(createFolder(fs, HOME_ID, 'One more', 'n-last')).toEqual({ ok: false, problem: 'full' });
    expect(saveNewFile(fs, HOME_ID, 'One more', { kind: 'note', text: '' }, 'n-last')).toEqual({
      ok: false,
      problem: 'full',
    });
  });

  it('names an untitled folder with the next free number', () => {
    const first = ok(createUntitledFolder(sample(), HOME_ID, 'New folder', 'n-a'));
    const second = ok(createUntitledFolder(first, HOME_ID, 'New folder', 'n-b'));
    expect(getNode(second, 'n-b')?.name).toBe('New folder 2');
  });
});

describe('renameNode', () => {
  it('renames and reports the old name', () => {
    const fs = sample();
    const result = renameNode(fs, id(fs, 'Notes'), 'My notes');
    expect(result).toMatchObject({ ok: true, from: 'Notes', node: { name: 'My notes' } });
  });

  it('lets an item change the case of its own name', () => {
    const fs = sample();
    expect(renameNode(fs, id(fs, 'Notes'), 'NOTES')).toMatchObject({ ok: true, node: { name: 'NOTES' } });
  });

  it.each([
    ['a sibling name', 'Music', 'duplicate'],
    ['an empty name', '', 'empty'],
    ['a bad character', 'a/b', 'bad-character'],
  ])('refuses %s', (_label, name, problem) => {
    const fs = sample();
    expect(renameNode(fs, id(fs, 'Notes'), name)).toEqual({ ok: false, problem });
  });

  it.each([
    ['home', HOME_ID, 'fixed-folder'],
    ['the trash', TRASH_ID, 'fixed-folder'],
    ['a missing item', 'n999', 'not-found'],
  ])('refuses to rename %s', (_label, nodeId, problem) => {
    expect(renameNode(sample(), nodeId, 'Other')).toEqual({ ok: false, problem });
  });

  it('refuses to rename an item in the trash', () => {
    const fs = sample();
    const trashed = ok(trashNode(fs, id(fs, 'Notes')));
    expect(renameNode(trashed, id(fs, 'Notes'), 'Other')).toEqual({ ok: false, problem: 'in-trash' });
  });
});

describe('moveNode', () => {
  it('moves a file into a folder and reports where it came from', () => {
    const fs = sample();
    const result = moveNode(fs, id(fs, 'fox facts'), id(fs, 'Notes'));
    expect(result).toMatchObject({ ok: true, changed: true, fromId: HOME_ID });
    expect(names(ok(result), id(fs, 'Notes'))).toEqual(['fox facts', 'Shopping list']);
  });

  it('changes nothing when the item is already there', () => {
    const fs = sample();
    const result = moveNode(fs, id(fs, 'Notes/Shopping list'), id(fs, 'Notes'));
    expect(result).toMatchObject({ ok: true, changed: false });
    expect(ok(result)).toBe(fs);
  });

  it('moves a folder with everything inside it', () => {
    const fs = sample();
    const moved = ok(moveNode(fs, id(fs, 'Pictures/Trips'), id(fs, 'Music')));
    expect(nodeAtPath(moved, 'Music/Trips/Boat')?.kind).toBe('picture');
  });

  it.each([
    ['into itself', 'Pictures', 'Pictures', 'into-itself'],
    ['into a folder inside it', 'Pictures', 'Pictures/Trips', 'into-itself'],
    ['onto a file', 'Notes', 'fox facts', 'not-a-folder'],
    ['next to an item with its name', 'Pictures/Fox', '', 'duplicate'],
  ])('refuses to move a folder %s', (_label, from, to, problem) => {
    const fs = buildDesktop({
      files: { Pictures: { Fox: picture('fox'), Trips: {} }, Notes: {}, 'fox facts': note(), Fox: note() },
    }).fs;
    expect(moveNode(fs, id(fs, from), id(fs, to))).toEqual({ ok: false, problem });
  });

  it.each([
    ['home', HOME_ID, 'fixed-folder'],
    ['a missing item', 'n999', 'not-found'],
  ])('refuses to move %s', (_label, nodeId, problem) => {
    const fs = sample();
    expect(moveNode(fs, nodeId, id(fs, 'Notes'))).toEqual({ ok: false, problem });
  });

  it('refuses a missing destination', () => {
    const fs = sample();
    expect(moveNode(fs, id(fs, 'fox facts'), 'n999')).toEqual({ ok: false, problem: 'not-found' });
  });

  it('deletes an item moved into the trash', () => {
    const fs = sample();
    const moved = ok(moveNode(fs, id(fs, 'fox facts'), TRASH_ID));
    expect(getNode(moved, id(fs, 'fox facts'))).toMatchObject({ parentId: TRASH_ID, trashedFrom: HOME_ID });
  });

  it('restores an item moved out of the trash into the folder it lands in', () => {
    const fs = sample();
    const trashed = ok(trashNode(fs, id(fs, 'fox facts')));
    const moved = ok(moveNode(trashed, id(fs, 'fox facts'), id(fs, 'Notes')));
    expect(getNode(moved, id(fs, 'fox facts'))).toMatchObject({ parentId: id(fs, 'Notes'), trashedFrom: null });
  });

  it('refuses to move an item out from inside a deleted folder', () => {
    const fs = sample();
    const trashed = ok(trashNode(fs, id(fs, 'Pictures')));
    expect(moveNode(trashed, id(fs, 'Pictures/Fox'), HOME_ID)).toEqual({ ok: false, problem: 'in-trash' });
  });
});

describe('trash and restore', () => {
  it('trashes a folder with its contents, which count as in the trash', () => {
    const fs = sample();
    const trashed = ok(trashNode(fs, id(fs, 'Pictures')));
    expect(isTrashed(trashed, id(fs, 'Pictures/Trips/Boat'))).toBe(true);
    expect(isTrashed(trashed, TRASH_ID)).toBe(false);
    expect(nodeAtPath(trashed, 'Pictures')).toBeUndefined();
  });

  it('lets two items with the same name sit in the trash', () => {
    const fs = buildDesktop({ files: { A: { Fox: note() }, B: { Fox: note() } } }).fs;
    const once = ok(trashNode(fs, id(fs, 'A/Fox')));
    const twice = ok(trashNode(once, id(fs, 'B/Fox')));
    expect(names(twice, TRASH_ID)).toEqual(['Fox', 'Fox']);
  });

  it.each([
    ['home', HOME_ID, 'fixed-folder'],
    ['the trash', TRASH_ID, 'fixed-folder'],
    ['a missing item', 'n999', 'not-found'],
  ])('refuses to trash %s', (_label, nodeId, problem) => {
    expect(trashNode(sample(), nodeId)).toEqual({ ok: false, problem });
  });

  it('refuses to trash an item already in the trash', () => {
    const fs = sample();
    const trashed = ok(trashNode(fs, id(fs, 'Pictures')));
    expect(trashNode(trashed, id(fs, 'Pictures'))).toEqual({ ok: false, problem: 'in-trash' });
    expect(trashNode(trashed, id(fs, 'Pictures/Fox'))).toEqual({ ok: false, problem: 'in-trash' });
  });

  it('restores an item to the folder it came from', () => {
    const fs = sample();
    const fox = id(fs, 'Pictures/Fox');
    const restored = restoreNode(ok(trashNode(fs, fox)), fox);
    expect(restored).toMatchObject({ ok: true, toId: id(fs, 'Pictures'), renamed: false });
    expect(nodeAtPath(ok(restored), 'Pictures/Fox')?.id).toBe(fox);
  });

  it('restores to home when the old folder is in the trash too', () => {
    const fs = sample();
    const fox = id(fs, 'Pictures/Fox');
    const both = ok(trashNode(ok(trashNode(fs, fox)), id(fs, 'Pictures')));
    expect(restoreNode(both, fox)).toMatchObject({ ok: true, toId: HOME_ID });
  });

  it('restores to home when the old folder is gone for good', () => {
    const fs = sample();
    const fox = id(fs, 'Pictures/Fox');
    const trashed = ok(trashNode(fs, fox));
    const node = getNode(trashed, fox);
    if (node === undefined) throw new Error('the fox is missing');
    // A saved desktop can remember a folder that no longer exists.
    const gone: FileSystem = { nodes: { ...trashed.nodes, [fox]: { ...node, trashedFrom: 'n999' } } };
    expect(restoreNode(gone, fox)).toMatchObject({ ok: true, toId: HOME_ID });
  });

  it('gives a restored item the next free name when its name is taken', () => {
    const fs = sample();
    const facts = id(fs, 'fox facts');
    const trashed = ok(trashNode(fs, facts));
    const replaced = ok(saveNewFile(trashed, HOME_ID, 'Fox facts', { kind: 'note', text: '' }, 'n-new'));
    expect(restoreNode(replaced, facts)).toMatchObject({ ok: true, renamed: true, node: { name: 'fox facts 2' } });
  });

  it.each([
    ['an item not in the trash', 'fox facts', 'not-in-trash'],
    ['an item inside a deleted folder', 'Pictures/Fox', 'not-in-trash'],
  ])('refuses to restore %s', (_label, path, problem) => {
    const fs = sample();
    const trashed = ok(trashNode(fs, id(fs, 'Pictures')));
    expect(restoreNode(trashed, id(fs, path))).toEqual({ ok: false, problem });
  });

  it('refuses to restore a missing item', () => {
    expect(restoreNode(sample(), 'n999')).toEqual({ ok: false, problem: 'not-found' });
  });

  it('empties the trash for good, contents included, and leaves everything else', () => {
    const fs = sample();
    const trashed = ok(trashNode(ok(trashNode(fs, id(fs, 'Pictures'))), id(fs, 'fox facts')));
    const { fs: emptied, removedIds } = emptyTrash(trashed);
    expect(removedIds.toSorted()).toEqual(
      ['Pictures', 'Pictures/Fox', 'Pictures/Owl', 'Pictures/Trips', 'Pictures/Trips/Boat', 'fox facts']
        .map((path) => id(fs, path))
        .toSorted(),
    );
    expect(Object.keys(emptied.nodes).length).toBe(Object.keys(fs.nodes).length - 6);
    expect(listFolder(emptied, TRASH_ID)).toEqual([]);
    expect(nodeAtPath(emptied, 'Notes/Shopping list')?.kind).toBe('note');
  });
});

describe('saving files', () => {
  it('saves a new file with its content', () => {
    const fs = ok(saveNewFile(sample(), HOME_ID, 'Song', tune([[0, 1]]), 'n-new'));
    expect(getNode(fs, 'n-new')).toMatchObject({ kind: 'tune', name: 'Song', parentId: HOME_ID });
  });

  it.each([
    ['a taken name', HOME_ID, 'Notes', 'duplicate'],
    ['a name that is too long', HOME_ID, 'x'.repeat(40), 'too-long'],
    ['the trash as the folder', TRASH_ID, 'Song', 'in-trash'],
    ['a missing folder', 'n999', 'Song', 'not-found'],
  ])('refuses %s', (_label, folderId, name, problem) => {
    expect(saveNewFile(sample(), folderId, name, { kind: 'note', text: '' }, 'n-new')).toEqual({ ok: false, problem });
  });

  it('saves over a file of the same kind', () => {
    const fs = sample();
    const list = id(fs, 'Notes/Shopping list');
    const saved = ok(overwriteFile(fs, list, { kind: 'note', text: 'eggs' }));
    expect(getNode(saved, list)).toMatchObject({ kind: 'note', text: 'eggs', name: 'Shopping list' });
  });

  it.each([
    ['a file of another kind', 'Pictures/Fox', 'wrong-kind'],
    ['a folder', 'Notes', 'wrong-kind'],
  ])('refuses to save a note over %s', (_label, path, problem) => {
    const fs = sample();
    expect(overwriteFile(fs, id(fs, path), { kind: 'note', text: 'x' })).toEqual({ ok: false, problem });
  });

  it('refuses to save over a missing file or a file in the trash', () => {
    const fs = sample();
    const facts = id(fs, 'fox facts');
    expect(overwriteFile(fs, 'n999', { kind: 'note', text: 'x' })).toEqual({ ok: false, problem: 'not-found' });
    const trashed = ok(trashNode(fs, facts));
    expect(overwriteFile(trashed, facts, { kind: 'note', text: 'x' })).toEqual({ ok: false, problem: 'in-trash' });
  });
});

describe('searchByName', () => {
  it('matches part of a name, ignoring case and spaces at the ends, sorted by place', () => {
    const fs = sample();
    expect(searchByName(fs, '  FOX ').map((node) => pathOf(fs, node.id))).toEqual(['fox facts', 'Pictures/Fox']);
  });

  it('finds folders as well as files', () => {
    const fs = sample();
    expect(searchByName(fs, 'trip').map((node) => node.name)).toEqual(['Trips']);
  });

  it('finds nothing for an empty query, and never home, the trash, or trashed items', () => {
    const fs = sample();
    const trashed = ok(trashNode(fs, id(fs, 'Pictures')));
    expect(searchByName(trashed, '')).toEqual([]);
    expect(searchByName(trashed, 'home')).toEqual([]);
    expect(searchByName(trashed, 'trash')).toEqual([]);
    expect(searchByName(trashed, 'owl')).toEqual([]);
  });
});

describe('file system edges', () => {
  it('finds nothing past a missing folder, and trims spaces around each part', () => {
    const fs = sample();
    expect(nodeAtPath(fs, 'Nope/Deeper/Still')).toBeUndefined();
    expect(nodeAtPath(fs, ' Pictures / Fox ')?.name).toBe('Fox');
  });

  it('checks a rename against the names in the item’s own folder', () => {
    const fs = buildDesktop({ files: { Notes: { A: note(), B: note() }, C: note() } }).fs;
    expect(renameNode(fs, id(fs, 'Notes/A'), 'b')).toEqual({ ok: false, problem: 'duplicate' });
    expect(renameNode(fs, id(fs, 'Notes/A'), 'C')).toMatchObject({ ok: true, node: { name: 'C' } });
  });

  it('restores an item that remembers no folder to home', () => {
    const fs = sample();
    const facts = id(fs, 'fox facts');
    const trashed = ok(trashNode(fs, facts));
    const node = getNode(trashed, facts);
    if (node === undefined) throw new Error('missing');
    const forgetful: FileSystem = { nodes: { ...trashed.nodes, [facts]: { ...node, trashedFrom: null } } };
    expect(restoreNode(forgetful, facts)).toMatchObject({ ok: true, toId: HOME_ID, node: { parentId: HOME_ID } });
  });

  it('sorts search results by place with numbers in order, ignoring case', () => {
    const fs = buildDesktop({ files: { 'item 10': note(), 'Item 9': note(), b: { 'Item 1': note() } } }).fs;
    expect(searchByName(fs, 'item').map((node) => pathOf(fs, node.id))).toEqual(['b/Item 1', 'Item 9', 'item 10']);
  });
});
