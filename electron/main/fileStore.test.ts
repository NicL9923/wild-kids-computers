import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BridgeError } from '../../src/core/platform/bridge.ts';
import { MAX_DOCUMENT_BYTES, MAX_THUMBNAIL_BYTES } from '../../src/core/platform/limits.ts';
import type { DocumentName } from '../../src/core/platform/names.ts';
import { createFileStore } from './fileStore.ts';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (marker: number) => Uint8Array.from([...SIGNATURE, marker]);

let root: string;
let clock: number;
let ids: string[];

function store() {
  return createFileStore(root, {
    now: () => clock,
    newId: () => {
      const id = ids.shift();
      if (id === undefined) throw new Error('The test ran out of ids.');
      return id;
    },
  });
}

async function rejection(pending: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await pending;
  } catch (error) {
    if (error instanceof BridgeError) return { code: error.code, message: error.message };
    throw error;
  }
  throw new Error('Expected a BridgeError, but the call succeeded.');
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'wkc-store-'));
  clock = Date.UTC(2026, 10, 13, 20, 15);
  ids = ['pic-a', 'pic-b', 'pic-c'];
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('documents', () => {
  it('reads null for a document never written, then reads back what was written', async () => {
    const { documents } = store();
    expect(await documents.read('profile/p1/settings')).toBeNull();
    await documents.write('profile/p1/settings', '{"version":1}');
    expect(await documents.read('profile/p1/settings')).toBe('{"version":1}');
    expect(await readFile(path.join(root, 'profile', 'p1', 'settings.json'), 'utf8')).toBe('{"version":1}');
  });

  it('leaves no temporary file behind', async () => {
    const { documents } = store();
    await documents.write('app', '{}');
    expect(await readdir(root)).toEqual(['app.json']);
  });

  it('keeps two writes to one document in call order', async () => {
    const { documents } = store();
    const writes = ['1', '2', '3'].map((text) => documents.write('app', text));
    await Promise.all(writes);
    expect(await documents.read('app')).toBe('3');
  });

  // Each name fits the DocumentName type, so only the runtime check stops it.
  it.each<[string, DocumentName]>([
    ['a parent segment as the profile', 'profile/../settings'],
    ['traversal in the activity id', 'profile/p1/activity/../../app'],
    ['a profile id with a space', 'profile/a b/progress'],
  ])('rejects %s', async (_label, name) => {
    const { documents } = store();
    expect(await rejection(documents.read(name))).toMatchObject({ code: 'invalid-argument' });
    expect(await rejection(documents.write(name, '{}'))).toMatchObject({ code: 'invalid-argument' });
    expect(await readdir(root)).toEqual([]);
  });

  it('accepts a document of exactly the cap and rejects one byte more', async () => {
    const { documents } = store();
    await documents.write('app', 'x'.repeat(MAX_DOCUMENT_BYTES));
    expect(await rejection(documents.write('app', 'é'.repeat(MAX_DOCUMENT_BYTES / 2) + 'x'))).toMatchObject({
      code: 'too-large',
    });
  });

  it('refuses to read a document that grew past the cap on disk', async () => {
    await writeFile(path.join(root, 'app.json'), 'x'.repeat(MAX_DOCUMENT_BYTES + 1));
    expect(await rejection(store().documents.read('app'))).toMatchObject({ code: 'too-large' });
  });

  it('sets a document aside under a stamped name, and again without overwriting the first', async () => {
    const { documents } = store();
    await documents.write('profile/p1/progress', 'bad one');
    expect(await documents.setAside('profile/p1/progress')).toBe(true);
    await documents.write('profile/p1/progress', 'bad two');
    expect(await documents.setAside('profile/p1/progress')).toBe(true);
    expect(await documents.read('profile/p1/progress')).toBeNull();
    const dir = path.join(root, 'profile', 'p1');
    expect((await readdir(dir)).toSorted()).toEqual([
      'progress.json.corrupt-20261113T201500000Z',
      'progress.json.corrupt-20261113T201500000Z-1',
    ]);
    expect(await readFile(path.join(dir, 'progress.json.corrupt-20261113T201500000Z'), 'utf8')).toBe('bad one');
  });

  it('reports false when there is nothing to set aside', async () => {
    expect(await store().documents.setAside('app')).toBe(false);
  });

  it('removes all of one profile and nothing of another', async () => {
    const { documents, pictures } = store();
    await documents.write('profile/p1/settings', '{}');
    await documents.write('profile/p1/activity/find-the-key', '{}');
    await pictures.save('p1', { png: png(1), thumbnail: png(2) });
    await documents.write('profile/p2/settings', '{}');
    await documents.removeProfile('p1');
    expect(await readdir(path.join(root, 'profile'))).toEqual(['p2']);
    await documents.removeProfile('p1');
  });

  it('rejects an unsafe profile id for removal', async () => {
    expect(await rejection(store().documents.removeProfile('..'))).toMatchObject({ code: 'invalid-argument' });
  });
});

describe('pictures', () => {
  it('saves a new picture with its thumbnail and reads both back', async () => {
    const { pictures } = store();
    const saved = await pictures.save('p1', { png: png(1), thumbnail: png(2) });
    expect(saved.id).toBe('pic-a');
    expect(await pictures.read('p1', 'pic-a', 'picture')).toEqual(png(1));
    expect(await pictures.read('p1', 'pic-a', 'thumbnail')).toEqual(png(2));
    expect(await pictures.list('p1', 'gallery')).toEqual([saved]);
  });

  it('overwrites a picture saved again under its id', async () => {
    const { pictures } = store();
    await pictures.save('p1', { png: png(1), thumbnail: png(2) });
    await pictures.save('p1', { id: 'pic-a', png: png(3), thumbnail: png(4) });
    expect(await pictures.read('p1', 'pic-a', 'picture')).toEqual(png(3));
    expect((await pictures.list('p1', 'gallery')).map((p) => p.id)).toEqual(['pic-a']);
  });

  it('refuses to save under an id that is not in the gallery', async () => {
    expect(await rejection(store().pictures.save('p1', { id: 'nope', png: png(1), thumbnail: png(1) }))).toMatchObject({
      code: 'not-found',
    });
  });

  it.each([
    ['a picture that is not a PNG', { png: Uint8Array.from([1, 2, 3]), thumbnail: png(1) }, 'invalid-argument'],
    ['a thumbnail that is not a PNG', { png: png(1), thumbnail: new Uint8Array(0) }, 'invalid-argument'],
    [
      'a thumbnail over the cap',
      { png: png(1), thumbnail: Uint8Array.from({ length: MAX_THUMBNAIL_BYTES + 1 }, (_, i) => SIGNATURE[i] ?? 0) },
      'too-large',
    ],
  ])('rejects %s', async (_label, input, code) => {
    const { pictures } = store();
    expect(await rejection(pictures.save('p1', input))).toMatchObject({ code });
    expect(await pictures.list('p1', 'gallery')).toEqual([]);
  });

  it('lists newest first and ignores thumbnails, temporary files, and stray names', async () => {
    const { pictures } = store();
    await pictures.save('p1', { png: png(1), thumbnail: png(1) });
    await pictures.save('p1', { png: png(2), thumbnail: png(2) });
    const dir = path.join(root, 'profile', 'p1', 'pictures');
    await utimes(path.join(dir, 'pic-a.png'), new Date(1_000), new Date(1_000));
    await utimes(path.join(dir, 'pic-b.png'), new Date(2_000), new Date(2_000));
    await writeFile(path.join(dir, 'pic-c.png.1234.tmp'), 'partial');
    await writeFile(path.join(dir, 'Bad Name.png'), 'x');
    expect(await pictures.list('p1', 'gallery')).toEqual([
      { id: 'pic-b', updatedAt: 2_000 },
      { id: 'pic-a', updatedAt: 1_000 },
    ]);
  });

  it('lists nothing for a profile with no pictures', async () => {
    expect(await store().pictures.list('nobody', 'trash')).toEqual([]);
  });

  it('copies a picture under a new id', async () => {
    const { pictures } = store();
    await pictures.save('p1', { png: png(1), thumbnail: png(2) });
    const copy = await pictures.copy('p1', 'pic-a');
    expect(copy.id).toBe('pic-b');
    expect(await pictures.read('p1', 'pic-b', 'picture')).toEqual(png(1));
    expect(await pictures.read('p1', 'pic-b', 'thumbnail')).toEqual(png(2));
  });

  it('moves a picture to the trash and restores it with its thumbnail', async () => {
    const { pictures } = store();
    await pictures.save('p1', { png: png(1), thumbnail: png(2) });
    await pictures.trash('p1', 'pic-a');
    expect(await pictures.list('p1', 'gallery')).toEqual([]);
    expect((await pictures.list('p1', 'trash')).map((p) => p.id)).toEqual(['pic-a']);
    expect(await pictures.read('p1', 'pic-a', 'thumbnail')).toEqual(png(2));
    const restored = await pictures.restore('p1', 'pic-a');
    expect(restored.id).toBe('pic-a');
    expect(await pictures.list('p1', 'trash')).toEqual([]);
    expect(await pictures.read('p1', 'pic-a', 'thumbnail')).toEqual(png(2));
  });

  it('purges only from the trash', async () => {
    const { pictures } = store();
    await pictures.save('p1', { png: png(1), thumbnail: png(2) });
    expect(await rejection(pictures.purge('p1', 'pic-a'))).toMatchObject({ code: 'not-found' });
    await pictures.trash('p1', 'pic-a');
    await pictures.purge('p1', 'pic-a');
    expect(await rejection(pictures.read('p1', 'pic-a', 'picture'))).toMatchObject({ code: 'not-found' });
    expect(await readdir(path.join(root, 'profile', 'p1', 'pictures', 'trash'))).toEqual([]);
  });

  it.each([
    ['restore a picture that is not in the trash', 'restore'],
    ['trash a picture that is not in the gallery', 'trash'],
    ['copy a picture that does not exist', 'copy'],
  ] as const)('refuses to %s', async (_label, action) => {
    const { pictures } = store();
    expect(await rejection(pictures[action]('p1', 'ghost'))).toMatchObject({
      code: 'not-found',
      message: expect.stringContaining('ghost'),
    });
  });

  it('cannot restore twice', async () => {
    const { pictures } = store();
    await pictures.save('p1', { png: png(1), thumbnail: png(1) });
    await pictures.trash('p1', 'pic-a');
    await pictures.restore('p1', 'pic-a');
    expect(await rejection(pictures.restore('p1', 'pic-a'))).toMatchObject({ code: 'not-found' });
  });

  it.each([
    ['profile id', () => store().pictures.list('../p1', 'gallery')],
    ['picture id', () => store().pictures.read('p1', '../../app', 'picture')],
  ])('rejects an unsafe %s', async (_label, call) => {
    expect(await rejection(call())).toMatchObject({ code: 'invalid-argument' });
  });

  it('still lists a picture whose thumbnail went missing', async () => {
    const { pictures } = store();
    await pictures.save('p1', { png: png(1), thumbnail: png(1) });
    await rm(path.join(root, 'profile', 'p1', 'pictures', 'pic-a.thumb.png'));
    await pictures.trash('p1', 'pic-a');
    expect((await pictures.list('p1', 'trash')).map((p) => p.id)).toEqual(['pic-a']);
  });
});
