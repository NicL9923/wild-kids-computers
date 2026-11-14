import type * as FsPromises from 'node:fs/promises';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BridgeError } from '../../src/core/platform/bridge.ts';
import { createFileStore } from './fileStore.ts';

/**
 * Another program that can write in the data directory can swap a directory the store already
 * checked for a link to somewhere else, before the store reads or writes through it. These tests
 * make that swap right after the store's link check looks at the file, the widest gap there is,
 * and expect the store to refuse instead of following the new link.
 */
const swap = vi.hoisted(() => {
  const state = {
    /** The call and path after which the swap happens, once. */
    after: null as { call: 'lstat' | 'mkdir'; path: string } | null,
    run: async () => {},
    async maybe(call: 'lstat' | 'mkdir', file: unknown): Promise<void> {
      if (state.after?.call !== call || String(file) !== state.after.path) return;
      state.after = null;
      await state.run();
    },
  };
  return state;
});

vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof FsPromises>();
  return {
    ...real,
    lstat: async (...args: Parameters<typeof real.lstat>) => {
      const info = await real.lstat(...args);
      await swap.maybe('lstat', args[0]);
      return info;
    },
    mkdir: async (...args: Parameters<typeof real.mkdir>) => {
      const made = await real.mkdir(...args);
      await swap.maybe('mkdir', args[0]);
      return made;
    },
  };
});

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (marker: number) => Uint8Array.from([...SIGNATURE, marker]);

let root: string;
let outside: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'wkc-race-'));
  outside = await mkdtemp(path.join(os.tmpdir(), 'wkc-race-outside-'));
  await writeFile(path.join(outside, 'settings.json'), 'outside settings');
  await writeFile(path.join(outside, 'pic-a.png'), png(9));
  await writeFile(path.join(outside, 'pic-a.thumb.png'), png(8));
  await writeFile(path.join(outside, 'outside-only.png'), png(7));
  swap.after = null;
});

afterEach(async () => {
  swap.after = null;
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

/** Replaces `dir` with a link to the outside directory right after the store's call on `file`. */
function swapAfter(call: 'lstat' | 'mkdir', file: string, dir: string): void {
  swap.after = { call, path: file };
  swap.run = async () => {
    await rename(dir, `${dir}-moved`);
    await symlink(outside, dir, 'dir');
  };
}

async function outsideContents(): Promise<Record<string, string>> {
  const names = (await readdir(outside)).toSorted();
  const entries = await Promise.all(
    names.map(async (name) => [name, (await readFile(path.join(outside, name))).toString('hex')] as const),
  );
  return Object.fromEntries(entries);
}

async function refusal(pending: Promise<unknown>): Promise<string> {
  try {
    await pending;
  } catch (error) {
    if (error instanceof BridgeError) return error.code;
    throw error;
  }
  throw new Error('The store followed the swapped directory.');
}

const settings = () => path.join(root, 'profile', 'p1', 'settings.json');
const profileDir = () => path.join(root, 'profile', 'p1');
const picture = () => path.join(root, 'profile', 'p1', 'pictures', 'pic-a.png');
const picturesDir = () => path.join(root, 'profile', 'p1', 'pictures');
const trashDir = () => path.join(root, 'profile', 'p1', 'pictures', 'trash');
const trashPicture = () => path.join(trashDir(), 'pic-a.png');

describe('a directory swapped for a link after the link check', () => {
  // Each case swaps right after the store's last look at the path before it acts: the link check
  // of the file, or for a move the folder it makes for the target.
  it.each([
    ['a document read', 'lstat', settings, profileDir, (s: Store) => s.documents.read('profile/p1/settings')],
    [
      'a document write',
      'lstat',
      settings,
      profileDir,
      (s: Store) => s.documents.write('profile/p1/settings', 'child'),
    ],
    ['a document set aside', 'lstat', settings, profileDir, (s: Store) => s.documents.setAside('profile/p1/settings')],
    ['a picture read', 'lstat', picture, picturesDir, (s: Store) => s.pictures.read('p1', 'pic-a', 'picture')],
    [
      'a picture save over an old one',
      'lstat',
      picture,
      picturesDir,
      (s: Store) => s.pictures.save('p1', { id: 'pic-a', png: png(3), thumbnail: png(4) }),
    ],
    ['a picture moved to the trash', 'mkdir', trashDir, trashDir, (s: Store) => s.pictures.trash('p1', 'pic-a')],
    // The gallery was already tidied by the save, so the listing is the first call through the swap.
    ['a picture list', 'lstat', picturesDir, picturesDir, (s: Store) => s.pictures.list('p1', 'gallery')],
    [
      'a picture purged from the trash',
      'lstat',
      trashPicture,
      trashDir,
      async (s: Store) => {
        await s.pictures.trash('p1', 'pic-a');
        return s.pictures.purge('p1', 'pic-a');
      },
    ],
  ] as const)('refuses %s', async (_label, call, checked, swapped, operation) => {
    const store = createFileStore(root, { newId: () => 'pic-a' });
    await store.documents.write('profile/p1/settings', 'inside settings');
    await store.pictures.save('p1', { png: png(1), thumbnail: png(2) });
    await mkdir(trashDir());
    const before = await outsideContents();

    swapAfter(call, checked(), swapped());
    expect(await refusal(operation(store))).toBe('forbidden');

    expect(swap.after).toBeNull();
    expect(await outsideContents()).toEqual(before);
  });

  it('still works through a data directory that is itself reached by a link', async () => {
    const linkedRoot = path.join(outside, 'linked-root');
    await symlink(root, linkedRoot, 'dir');
    const store = createFileStore(linkedRoot, { newId: () => 'pic-a' });
    await store.documents.write('profile/p1/settings', 'inside');
    await store.pictures.save('p1', { png: png(1), thumbnail: png(2) });
    await store.pictures.trash('p1', 'pic-a');
    expect(await store.documents.read('profile/p1/settings')).toBe('inside');
    expect(await readdir(path.join(root, 'profile', 'p1', 'pictures', 'trash'))).toContain('pic-a.png');
  });

  it('refuses once the data directory itself is swapped for a link', async () => {
    const data = path.join(root, 'data');
    await mkdir(data);
    const store = createFileStore(data);
    await store.documents.write('app', '{}');
    await rename(data, `${data}-moved`);
    await symlink(outside, data, 'dir');
    expect(await refusal(store.documents.write('app', 'child'))).toBe('forbidden');
    expect(await readdir(outside)).not.toContain('app.json');
  });
});

type Store = ReturnType<typeof createFileStore>;
