import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { BridgeError, type DocumentStore } from '../platform/bridge.ts';
import { MAX_DOCUMENT_BYTES } from '../platform/limits.ts';
import type { DocumentName } from '../platform/names.ts';
import { defineDocument, loadDocument, parseDocument, saveDocument } from './document.ts';
import { appDocument } from './schemas.ts';

const NAME: DocumentName = 'app';

/**
 * A test-only document at version 2 with a real chain from version 0. Version 0 stored `name`,
 * version 1 renamed it to `title`, and version 2 added `tags`. The migrations depend on running
 * in order: the second one reads the field the first one wrote.
 */
const v2Schema = z.object({ version: z.literal(2), title: z.string(), tags: z.array(z.string()) });
const chainDocument = defineDocument<z.infer<typeof v2Schema>>({
  version: 2,
  schema: v2Schema,
  migrations: {
    0: ({ name, ...rest }) => ({ ...rest, title: name }),
    1: (document) => ({ ...document, tags: [String(document.title).toLowerCase()] }),
  },
  defaults: () => ({ version: 2, title: '', tags: [] }),
});

const validApp = JSON.stringify(appDocument.defaults());

describe('parseDocument', () => {
  it('accepts a current, valid document without migrating it', () => {
    expect(parseDocument(validApp, appDocument)).toEqual({ ok: true, value: appDocument.defaults(), migrated: false });
  });

  it('migrates a version 0 fixture through every step in order', () => {
    const result = parseDocument(JSON.stringify({ version: 0, name: 'Meadow' }), chainDocument);
    expect(result).toEqual({ ok: true, value: { version: 2, title: 'Meadow', tags: ['meadow'] }, migrated: true });
  });

  it('starts the chain at the saved version', () => {
    const result = parseDocument(JSON.stringify({ version: 1, title: 'Pond' }), chainDocument);
    expect(result).toEqual({ ok: true, value: { version: 2, title: 'Pond', tags: ['pond'] }, migrated: true });
  });

  it('sets the version after each step, whatever the migration returned', () => {
    const spec = defineDocument({
      ...chainDocument,
      migrations: { ...chainDocument.migrations, 0: ({ name }) => ({ version: 0, title: name }) },
    });
    expect(parseDocument(JSON.stringify({ version: 0, name: 'Hill' }), spec)).toMatchObject({ ok: true });
  });

  it.each([
    ['invalid JSON', '{"version":1,', 'invalid-json'],
    ['null', 'null', 'not-an-object'],
    ['an array', '[1]', 'not-an-object'],
    ['a number', '42', 'not-an-object'],
    ['a missing version', '{"kioskLock":false}', 'bad-version'],
    ['a string version', '{"version":"1"}', 'bad-version'],
    ['a fractional version', '{"version":1.5}', 'bad-version'],
    ['a negative version', '{"version":-1}', 'bad-version'],
    ['an unknown future version', '{"version":2}', 'future-version'],
    ['a version with no migration', '{"version":0}', 'no-migration'],
    ['a wrong field type', JSON.stringify({ ...appDocument.defaults(), kioskLock: 'yes' }), 'invalid'],
    ['a missing field', JSON.stringify({ version: 1, kioskLock: false }), 'invalid'],
  ])('rejects %s', (_label, text, reason) => {
    expect(parseDocument(text, appDocument)).toMatchObject({ ok: false, reason });
  });

  it('names the failing field', () => {
    const text = JSON.stringify({ ...appDocument.defaults(), kioskLock: 'yes' });
    expect(parseDocument(text, appDocument)).toMatchObject({ detail: expect.stringContaining('kioskLock') });
  });

  it('reports a migration that throws', () => {
    const spec = defineDocument({
      ...chainDocument,
      migrations: {
        0: () => {
          throw new Error('broken step');
        },
      },
    });
    expect(parseDocument('{"version":0}', spec)).toEqual({
      ok: false,
      reason: 'migration-failed',
      detail: 'migration from version 0 threw: broken step',
    });
  });

  it('measures size in UTF-8 bytes on both sides of the cap', () => {
    const base = validApp.slice(0, -1);
    const padTo = (bytes: number) => `${base},"pad":"${'x'.repeat(bytes - base.length - 10)}"}`;
    expect(new TextEncoder().encode(padTo(MAX_DOCUMENT_BYTES)).length).toBe(MAX_DOCUMENT_BYTES);
    expect(parseDocument(padTo(MAX_DOCUMENT_BYTES), appDocument)).toMatchObject({ ok: true });
    expect(parseDocument(padTo(MAX_DOCUMENT_BYTES + 1), appDocument)).toMatchObject({ ok: false, reason: 'too-large' });
    // Two bytes per character: under the cap in characters, over it in bytes.
    const wide = `${base},"pad":"${'é'.repeat(MAX_DOCUMENT_BYTES / 2)}"}`;
    expect(wide.length).toBeLessThan(MAX_DOCUMENT_BYTES);
    expect(parseDocument(wide, appDocument)).toMatchObject({ ok: false, reason: 'too-large' });
  });
});

/** An in-memory document store. Anything a test did not set up reads as missing. */
function memoryStore(initial: Partial<Record<DocumentName, string>> = {}) {
  const entries = Object.entries(initial).filter((entry): entry is [string, string] => entry[1] !== undefined);
  const files = new Map<string, string>(entries);
  const setAside: string[] = [];
  const store: Pick<DocumentStore, 'read' | 'setAside' | 'write'> = {
    read: async (name) => files.get(name) ?? null,
    write: async (name, text) => {
      files.set(name, text);
    },
    setAside: async (name) => {
      setAside.push(name);
      return files.delete(name);
    },
  };
  return { store, files, setAside };
}

describe('loadDocument', () => {
  it('returns defaults for a document that was never saved and moves nothing', async () => {
    const { store, setAside } = memoryStore();
    expect(await loadDocument(store, NAME, appDocument)).toEqual({ value: appDocument.defaults(), status: 'missing' });
    expect(setAside).toEqual([]);
  });

  it('returns a valid document as saved', async () => {
    const saved = { ...appDocument.defaults(), kioskLock: true };
    const { store } = memoryStore({ app: JSON.stringify(saved) });
    expect(await loadDocument(store, NAME, appDocument)).toEqual({ value: saved, status: 'loaded' });
  });

  it('reports a migrated document so the caller can save the new version', async () => {
    const { store } = memoryStore({ app: JSON.stringify({ version: 0, name: 'Fern' }) });
    expect(await loadDocument(store, NAME, chainDocument)).toMatchObject({ status: 'migrated' });
  });

  it.each([
    ['invalid JSON', '{', 'invalid-json'],
    ['an unknown future version', '{"version":9}', 'future-version'],
    ['a wrong type', JSON.stringify({ ...appDocument.defaults(), parentPin: 'abc' }), 'invalid'],
  ])('sets aside %s and returns defaults', async (_label, text, reason) => {
    const { store, files, setAside } = memoryStore({ app: text });
    const result = await loadDocument(store, NAME, appDocument);
    expect(result).toMatchObject({
      value: appDocument.defaults(),
      status: 'reset',
      problem: expect.stringMatching(`^${reason}:`),
    });
    expect(setAside).toEqual([NAME]);
    expect(files.has(NAME)).toBe(false);
  });

  it('sets aside a document the platform refuses to read because it is too large', async () => {
    const { store, setAside } = memoryStore();
    store.read = async () => {
      throw new BridgeError('too-large', 'over the cap');
    };
    expect(await loadDocument(store, NAME, appDocument)).toMatchObject({
      status: 'reset',
      problem: 'too-large: over the cap',
    });
    expect(setAside).toEqual([NAME]);
  });

  it('leaves an unreadable document in place, because the data may be fine', async () => {
    const { store, setAside } = memoryStore();
    store.read = async () => {
      throw new BridgeError('io', 'disk busy');
    };
    expect(await loadDocument(store, NAME, appDocument)).toEqual({
      value: appDocument.defaults(),
      status: 'unreadable',
      problem: 'disk busy',
    });
    expect(setAside).toEqual([]);
  });

  it('still returns defaults when setting the file aside fails', async () => {
    const { store } = memoryStore({ app: '{' });
    store.setAside = async () => {
      throw new BridgeError('io', 'read-only disk');
    };
    expect(await loadDocument(store, NAME, appDocument)).toMatchObject({
      value: appDocument.defaults(),
      status: 'reset',
    });
  });
});

describe('saveDocument', () => {
  it('writes JSON that loads back to the same value', async () => {
    const { store } = memoryStore();
    const value = { ...appDocument.defaults(), firstLaunchDone: true };
    await saveDocument(store, NAME, appDocument, value);
    expect(await loadDocument(store, NAME, appDocument)).toEqual({ value, status: 'loaded' });
  });

  it('refuses a value the next load would reject, and writes nothing', async () => {
    const { store, files } = memoryStore();
    const bad = { ...appDocument.defaults(), lastActiveProfileId: '../escape' };
    await expect(saveDocument(store, NAME, appDocument, bad)).rejects.toThrow(/lastActiveProfileId/);
    expect(files.size).toBe(0);
  });
});
