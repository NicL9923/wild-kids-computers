/**
 * The pretend file system. Plain data, so it saves as JSON with the rest of the desktop. Every
 * operation returns a new file system or a reason it refused; nothing here throws on a child's
 * input.
 */
import { checkName, uniqueName, type NameProblem } from './names.ts';
import type { Tune } from './apps/tune.ts';

/** The child's own folder. Everything that is not in the trash lives under it. */
export const HOME_ID = 'home';
export const TRASH_ID = 'trash';

/** The most items the file system holds, so a saved desktop stays small. */
export const MAX_NODES = 300;

/** The longest note, in characters. */
export const MAX_NOTE_LENGTH = 2000;

export const FILE_KINDS = ['note', 'picture', 'tune'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export type FileContent =
  | { kind: 'note'; text: string }
  /** A picture refers to bundled art by id. The screen maps the id to an image. */
  | { kind: 'picture'; pictureId: string }
  | { kind: 'tune'; tune: Tune };

interface NodeFields {
  id: string;
  name: string;
  /** `null` only for the home folder and the trash. */
  parentId: string | null;
  /** For an item directly in the trash: the folder it was deleted from. Otherwise `null`. */
  trashedFrom: string | null;
}

export type FolderNode = NodeFields & { kind: 'folder' };
export type FileNode = NodeFields & FileContent;
export type FsNode = FolderNode | FileNode;

export interface FileSystem {
  nodes: Record<string, FsNode>;
}

export type FsProblem =
  /** No item has that id. */
  | 'not-found'
  /** The target of a move, save, or new folder is a file. */
  | 'not-a-folder'
  /** Home and the trash cannot be renamed, moved, or deleted. */
  | 'fixed-folder'
  /** A folder cannot move into itself or into a folder inside it. */
  | 'into-itself'
  /** Items in the trash cannot be renamed or changed, and nothing new goes into the trash. */
  | 'in-trash'
  /** Restore works only on an item directly in the trash. */
  | 'not-in-trash'
  /** A file can only be saved over by content of its own kind, so a tune never replaces a note. */
  | 'wrong-kind'
  /** The file system holds `MAX_NODES` items already. */
  | 'full';

export type FsResult<T = object> = ({ ok: true; fs: FileSystem } & T) | { ok: false; problem: FsProblem | NameProblem };

export function emptyFileSystem(): FileSystem {
  return {
    nodes: {
      [HOME_ID]: { id: HOME_ID, name: 'Home', parentId: null, trashedFrom: null, kind: 'folder' },
      [TRASH_ID]: { id: TRASH_ID, name: 'Trash', parentId: null, trashedFrom: null, kind: 'folder' },
    },
  };
}

export function getNode(fs: FileSystem, id: string): FsNode | undefined {
  return Object.hasOwn(fs.nodes, id) ? fs.nodes[id] : undefined;
}

export function isFolder(node: FsNode | undefined): node is FolderNode {
  return node?.kind === 'folder';
}

export function isFile(node: FsNode | undefined): node is FileNode {
  return node !== undefined && node.kind !== 'folder';
}

function compareNodes(a: FsNode, b: FsNode): number {
  if ((a.kind === 'folder') !== (b.kind === 'folder')) return a.kind === 'folder' ? -1 : 1;
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true });
}

/** The items in a folder: folders first, then files, each by name. */
export function listFolder(fs: FileSystem, folderId: string): FsNode[] {
  return Object.values(fs.nodes)
    .filter((node) => node.parentId === folderId)
    .toSorted(compareNodes);
}

function siblingNames(fs: FileSystem, folderId: string, exceptId?: string): string[] {
  return listFolder(fs, folderId)
    .filter((node) => node.id !== exceptId)
    .map((node) => node.name);
}

/** The folders from the top down to this item, the item included. */
export function ancestry(fs: FileSystem, id: string): FsNode[] {
  const chain: FsNode[] = [];
  let node = getNode(fs, id);
  // A saved file system is checked for cycles, so this walk ends. The cap guards a hand-built one.
  while (node !== undefined && chain.length <= MAX_NODES + 2) {
    chain.unshift(node);
    node = node.parentId === null ? undefined : getNode(fs, node.parentId);
  }
  return chain;
}

/** True when the item is the folder or anywhere inside it. */
function isInside(fs: FileSystem, id: string, folderId: string): boolean {
  return ancestry(fs, id).some((node) => node.id === folderId);
}

/** True when the item is in the trash, directly or inside a deleted folder. */
export function isTrashed(fs: FileSystem, id: string): boolean {
  return id !== TRASH_ID && isInside(fs, id, TRASH_ID);
}

/** The item's place under home, such as "Pictures/Cat". Home itself is "". */
export function pathOf(fs: FileSystem, id: string): string {
  return ancestry(fs, id)
    .slice(1)
    .map((node) => node.name)
    .join('/');
}

/**
 * Finds an item by its place under home, such as "Pictures/Cat". Names match ignoring case,
 * as the duplicate rule does. "" is home. Items in the trash are never found this way.
 */
export function nodeAtPath(fs: FileSystem, path: string): FsNode | undefined {
  let node = getNode(fs, HOME_ID);
  for (const part of path.split('/').filter((segment) => segment !== '')) {
    if (node === undefined) return undefined;
    const name = part.trim().toLocaleLowerCase('en');
    node = listFolder(fs, node.id).find((child) => child.name.toLocaleLowerCase('en') === name);
  }
  return node;
}

/** Every item inside a folder, at any depth, not counting the folder. */
function descendants(fs: FileSystem, folderId: string): FsNode[] {
  return listFolder(fs, folderId).flatMap((child) => [child, ...descendants(fs, child.id)]);
}

function withNode(fs: FileSystem, node: FsNode): FileSystem {
  return { nodes: { ...fs.nodes, [node.id]: node } };
}

function isFixed(id: string): boolean {
  return id === HOME_ID || id === TRASH_ID;
}

/** A folder that can receive items: it exists, is a folder, and is not in the trash. */
function openFolder(fs: FileSystem, folderId: string): FsProblem | null {
  const folder = getNode(fs, folderId);
  if (folder === undefined) return 'not-found';
  if (!isFolder(folder)) return 'not-a-folder';
  if (folderId === TRASH_ID || isTrashed(fs, folderId)) return 'in-trash';
  return null;
}

function isFull(fs: FileSystem): boolean {
  return Object.keys(fs.nodes).length >= MAX_NODES;
}

export function createFolder(
  fs: FileSystem,
  parentId: string,
  name: string,
  id: string,
): FsResult<{ node: FolderNode }> {
  const problem = openFolder(fs, parentId);
  if (problem !== null) return { ok: false, problem };
  if (isFull(fs)) return { ok: false, problem: 'full' };
  const check = checkName(name, siblingNames(fs, parentId));
  if (!check.ok) return { ok: false, problem: check.problem };
  const node: FolderNode = { id, name: check.name, parentId, trashedFrom: null, kind: 'folder' };
  return { ok: true, fs: withNode(fs, node), node };
}

/** Creates a folder with the first free name from `base`, such as "New folder 2". */
export function createUntitledFolder(
  fs: FileSystem,
  parentId: string,
  base: string,
  id: string,
): FsResult<{ node: FolderNode }> {
  return createFolder(fs, parentId, uniqueName(base, siblingNames(fs, parentId)), id);
}

export function renameNode(fs: FileSystem, id: string, name: string): FsResult<{ node: FsNode; from: string }> {
  const node = getNode(fs, id);
  if (node === undefined) return { ok: false, problem: 'not-found' };
  if (isFixed(id)) return { ok: false, problem: 'fixed-folder' };
  if (isTrashed(fs, id)) return { ok: false, problem: 'in-trash' };
  // A node that is not fixed always has a parent.
  const check = checkName(name, siblingNames(fs, node.parentId ?? HOME_ID, id));
  if (!check.ok) return { ok: false, problem: check.problem };
  const renamed = { ...node, name: check.name };
  return { ok: true, fs: withNode(fs, renamed), node: renamed, from: node.name };
}

/**
 * Moves an item into a folder. Moving into the trash deletes it, and moving an item out of the
 * trash restores it to the folder it lands in. `fromId` is the folder it left.
 */
export function moveNode(
  fs: FileSystem,
  id: string,
  toId: string,
): FsResult<{ node: FsNode; fromId: string; changed: boolean }> {
  if (toId === TRASH_ID) {
    const trashed = trashNode(fs, id);
    return trashed.ok ? { ...trashed, changed: true } : trashed;
  }
  const node = getNode(fs, id);
  if (node === undefined) return { ok: false, problem: 'not-found' };
  if (isFixed(id)) return { ok: false, problem: 'fixed-folder' };
  const problem = openFolder(fs, toId);
  if (problem !== null) return { ok: false, problem };
  const fromId = node.parentId ?? HOME_ID;
  if (fromId === toId) return { ok: true, fs, node, fromId, changed: false };
  if (isInside(fs, toId, id)) return { ok: false, problem: 'into-itself' };
  if (fromId !== TRASH_ID && isTrashed(fs, id)) return { ok: false, problem: 'in-trash' };
  const check = checkName(node.name, siblingNames(fs, toId));
  if (!check.ok) return { ok: false, problem: check.problem };
  const moved = { ...node, parentId: toId, trashedFrom: null };
  return { ok: true, fs: withNode(fs, moved), node: moved, fromId, changed: true };
}

/** Moves an item to the trash and remembers where it came from. */
export function trashNode(fs: FileSystem, id: string): FsResult<{ node: FsNode; fromId: string }> {
  const node = getNode(fs, id);
  if (node === undefined) return { ok: false, problem: 'not-found' };
  if (isFixed(id)) return { ok: false, problem: 'fixed-folder' };
  if (isTrashed(fs, id)) return { ok: false, problem: 'in-trash' };
  const fromId = node.parentId ?? HOME_ID;
  const trashed = { ...node, parentId: TRASH_ID, trashedFrom: fromId };
  return { ok: true, fs: withNode(fs, trashed), node: trashed, fromId };
}

/**
 * Puts an item from the trash back where it came from. When that folder is gone or in the
 * trash itself, the item goes to home. When its name is taken there, it gets the next free
 * name, such as "Cat 2", so a restore never fails because of a name.
 */
export function restoreNode(fs: FileSystem, id: string): FsResult<{ node: FsNode; toId: string; renamed: boolean }> {
  const node = getNode(fs, id);
  if (node === undefined) return { ok: false, problem: 'not-found' };
  if (node.parentId !== TRASH_ID) return { ok: false, problem: 'not-in-trash' };
  const from = node.trashedFrom;
  const toId = from !== null && openFolder(fs, from) === null ? from : HOME_ID;
  const name = uniqueName(node.name, siblingNames(fs, toId));
  const restored = { ...node, name, parentId: toId, trashedFrom: null };
  return { ok: true, fs: withNode(fs, restored), node: restored, toId, renamed: name !== node.name };
}

/** Removes everything in the trash for good. `removedIds` lists every item removed. */
export function emptyTrash(fs: FileSystem): { fs: FileSystem; removedIds: string[] } {
  const removed = descendants(fs, TRASH_ID).map((node) => node.id);
  const gone = new Set(removed);
  const nodes = Object.fromEntries(Object.entries(fs.nodes).filter(([id]) => !gone.has(id)));
  return { fs: { nodes }, removedIds: removed };
}

/** Saves a new file into a folder. The name follows every name rule. */
export function saveNewFile(
  fs: FileSystem,
  folderId: string,
  name: string,
  content: FileContent,
  id: string,
): FsResult<{ node: FileNode }> {
  const problem = openFolder(fs, folderId);
  if (problem !== null) return { ok: false, problem };
  if (isFull(fs)) return { ok: false, problem: 'full' };
  const check = checkName(name, siblingNames(fs, folderId));
  if (!check.ok) return { ok: false, problem: check.problem };
  const node: FileNode = { id, name: check.name, parentId: folderId, trashedFrom: null, ...content };
  return { ok: true, fs: withNode(fs, node), node };
}

/** Replaces a file's content. The kind must match, so a tune never overwrites a note. */
export function overwriteFile(fs: FileSystem, id: string, content: FileContent): FsResult<{ node: FileNode }> {
  const node = getNode(fs, id);
  if (node === undefined) return { ok: false, problem: 'not-found' };
  if (!isFile(node) || node.kind !== content.kind) return { ok: false, problem: 'wrong-kind' };
  if (isTrashed(fs, id)) return { ok: false, problem: 'in-trash' };
  const updated: FileNode = { ...node, ...content };
  return { ok: true, fs: withNode(fs, updated), node: updated };
}

/**
 * Finds items whose name contains the query, ignoring case and spaces at either end. Items in
 * the trash are left out. Results are sorted by their place under home.
 */
export function searchByName(fs: FileSystem, query: string): FsNode[] {
  const needle = query.trim().toLocaleLowerCase('en');
  if (needle === '') return [];
  return Object.values(fs.nodes)
    .filter((node) => !isFixed(node.id) && !isTrashed(fs, node.id))
    .filter((node) => node.name.toLocaleLowerCase('en').includes(needle))
    .toSorted((a, b) => pathOf(fs, a.id).localeCompare(pathOf(fs, b.id), 'en', { sensitivity: 'base', numeric: true }));
}

/** The files of one kind in a folder, in listing order. The picture viewer steps through these. */
export function filesOfKind(fs: FileSystem, folderId: string, kind: FileKind): FileNode[] {
  return listFolder(fs, folderId).filter((node): node is FileNode => node.kind === kind);
}
