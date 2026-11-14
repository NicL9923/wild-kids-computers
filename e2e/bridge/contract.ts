import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod';
import { MAX_DOCUMENT_BYTES } from '../../src/core/platform/limits.ts';
import { solidPng } from './png.ts';

/**
 * The PlatformBridge contract suite from "Platform bridge" in docs/architecture.md. One suite,
 * two targets: e2e/bridge/electron.spec.ts runs it against the Electron app, and
 * e2e/browser/bridge.spec.ts against the static browser build. Every call goes through the
 * bridge the app itself uses, which the page exposes on window.wkcTest in a test run.
 */

export interface BridgeSession {
  page: Page;
  close: () => Promise<void>;
}

const outcomeSchema = z.union([
  z.object({ ok: z.literal(true), value: z.unknown() }),
  z.object({ ok: z.literal(false), code: z.string().nullable(), message: z.string() }),
]);

/** What a call returned or threw. Bytes travel as number arrays. */
export type Outcome = z.infer<typeof outcomeSchema>;

export interface BridgeTarget {
  name: 'electron' | 'browser';
  isElectron: boolean;
  /** A fresh app with empty storage and the bridge on window.wkcTest. */
  open: () => Promise<BridgeSession>;
  /** Runs an export that saves without a dialog, and returns the bytes that landed on disk. */
  captureExport: (
    session: BridgeSession,
    run: () => Promise<Outcome>,
  ) => Promise<{ outcome: Outcome; saved: number[] | null }>;
  /** Runs a print without a dialog, and returns the width of the image the print showed. */
  capturePrint: (
    session: BridgeSession,
    run: () => Promise<Outcome>,
  ) => Promise<{ outcome: Outcome; printedWidth: number | null }>;
  /** Replaces the stored thumbnail of a gallery picture behind the bridge, as damage on disk would. */
  damageThumbnail: (session: BridgeSession, profileId: string, id: string, stored: number[]) => Promise<void>;
}

const BYTES = '__bytes';

/**
 * Calls one bridge method in the page, such as `pictures.save`. Arguments and results are
 * JSON with bytes marked, because Playwright moves plain data across the boundary.
 */
export async function call(page: Page, method: string, ...args: unknown[]): Promise<Outcome> {
  const argsJson = JSON.stringify(args, (_key, item: unknown) =>
    item instanceof Uint8Array ? { [BYTES]: [...item] } : item,
  );
  const resultJson = await page.evaluate(
    async ({ method: name, argsJson: json, marker }) => {
      const bridge = window.wkcTest?.bridge;
      if (bridge === undefined) throw new Error('The page has no test hook.');
      const [group = '', member] = name.split('.');
      const owner: unknown = member === undefined ? bridge : Reflect.get(bridge, group);
      const fn: unknown = typeof owner === 'object' && owner !== null ? Reflect.get(owner, member ?? group) : undefined;
      if (typeof fn !== 'function') throw new Error(`The bridge has no method ${name}.`);
      const revived: unknown = JSON.parse(json, (_key, item: unknown) =>
        typeof item === 'object' && item !== null && marker in item ? Uint8Array.from(Reflect.get(item, marker)) : item,
      );
      try {
        const result: unknown = await Reflect.apply(fn, owner, Array.isArray(revived) ? revived : []);
        return JSON.stringify({ ok: true, value: result }, (_key, item: unknown) =>
          item instanceof Uint8Array ? [...item] : item === undefined ? null : item,
        );
      } catch (error) {
        const code: unknown = typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : null;
        const message = error instanceof Error ? error.message : String(error);
        return JSON.stringify({ ok: false, code: typeof code === 'string' ? code : null, message });
      }
    },
    { method, argsJson, marker: BYTES },
  );
  return outcomeSchema.parse(JSON.parse(resultJson));
}

export async function waitForBridge(page: Page): Promise<void> {
  await page.waitForFunction(() => window.wkcTest !== undefined);
}

function unwrap(outcome: Outcome): unknown {
  if (!outcome.ok) throw new Error(`Expected success, got ${outcome.code ?? 'an error'}: ${outcome.message}`);
  return outcome.value;
}

const failure = (code: string) => expect.objectContaining({ ok: false, code });

const PICTURE = solidPng(4, 3, [255, 120, 0, 255]);
const THUMBNAIL = solidPng(2, 1, [0, 0, 255, 255]);
const OTHER_PICTURE = solidPng(5, 5, [0, 200, 0, 255]);
const bytes = (list: number[]) => Uint8Array.from(list);
const packageVersion = z
  .object({ version: z.string() })
  .parse(JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../package.json'), 'utf8'))).version;

const pictureSummary = z.object({ id: z.string(), updatedAt: z.number() });

async function savePicture(page: Page, png = PICTURE): Promise<z.infer<typeof pictureSummary>> {
  return pictureSummary.parse(
    unwrap(await call(page, 'pictures.save', 'p1', { png: bytes(png), thumbnail: bytes(THUMBNAIL) })),
  );
}

async function pictureIds(page: Page, place: 'gallery' | 'trash'): Promise<string[]> {
  return z
    .array(pictureSummary)
    .parse(unwrap(await call(page, 'pictures.list', 'p1', place)))
    .map((picture) => picture.id);
}

export function defineBridgeContract(target: BridgeTarget): void {
  test.describe(`PlatformBridge contract (${target.name})`, () => {
    let session: BridgeSession;
    let page: Page;

    test.beforeEach(async () => {
      session = await target.open();
      page = session.page;
      await waitForBridge(page);
    });

    test.afterEach(async () => {
      await session.close();
    });

    test('info names the platform and the app version', async () => {
      expect(unwrap(await call(page, 'info'))).toMatchObject({
        os: expect.stringMatching(/^(mac|windows|linux)$/),
        appVersion: packageVersion,
        isElectron: target.isElectron,
      });
    });

    test.describe('documents', () => {
      test('a document never written reads as null, and a write reads back', async () => {
        expect(await call(page, 'documents.read', 'profile/p1/settings')).toEqual({ ok: true, value: null });
        unwrap(await call(page, 'documents.write', 'profile/p1/settings', '{"version":1}'));
        expect(await call(page, 'documents.read', 'profile/p1/settings')).toEqual({ ok: true, value: '{"version":1}' });
        unwrap(await call(page, 'documents.write', 'profile/p1/settings', '{"version":1,"muted":true}'));
        expect(await call(page, 'documents.read', 'profile/p1/settings')).toEqual({
          ok: true,
          value: '{"version":1,"muted":true}',
        });
      });

      test('setting a document aside empties its name and reports whether there was one', async () => {
        unwrap(await call(page, 'documents.write', 'profile/p1/activity/find-the-key', 'not json'));
        expect(await call(page, 'documents.setAside', 'profile/p1/activity/find-the-key')).toEqual({
          ok: true,
          value: true,
        });
        expect(await call(page, 'documents.read', 'profile/p1/activity/find-the-key')).toEqual({
          ok: true,
          value: null,
        });
        expect(await call(page, 'documents.setAside', 'profile/p1/activity/find-the-key')).toEqual({
          ok: true,
          value: false,
        });
      });

      for (const name of ['../app', 'profile/A/settings', 'profile/p1/secrets', 'profile/p1/activity/../../app']) {
        test(`rejects the name ${JSON.stringify(name)}`, async () => {
          expect(await call(page, 'documents.read', name)).toEqual(failure('invalid-argument'));
          expect(await call(page, 'documents.write', name, '{}')).toEqual(failure('invalid-argument'));
          expect(await call(page, 'documents.setAside', name)).toEqual(failure('invalid-argument'));
        });
      }

      test('rejects a document over the size cap and keeps the old one', async () => {
        unwrap(await call(page, 'documents.write', 'app', '{"version":1}'));
        expect(await call(page, 'documents.write', 'app', 'x'.repeat(MAX_DOCUMENT_BYTES + 1))).toEqual(
          failure('too-large'),
        );
        expect(await call(page, 'documents.read', 'app')).toEqual({ ok: true, value: '{"version":1}' });
      });

      test('removing a profile deletes its documents and pictures and nothing else', async () => {
        unwrap(await call(page, 'documents.write', 'app', '{}'));
        unwrap(await call(page, 'documents.write', 'profile/p1/progress', '{}'));
        unwrap(await call(page, 'documents.write', 'profile/p2/progress', '{}'));
        unwrap(await call(page, 'pictures.save', 'p1', { png: bytes(PICTURE), thumbnail: bytes(THUMBNAIL) }));
        unwrap(await call(page, 'documents.removeProfile', 'p1'));
        expect(await call(page, 'documents.read', 'profile/p1/progress')).toEqual({ ok: true, value: null });
        expect(await call(page, 'pictures.list', 'p1', 'gallery')).toEqual({ ok: true, value: [] });
        expect(await call(page, 'documents.read', 'profile/p2/progress')).toEqual({ ok: true, value: '{}' });
        expect(await call(page, 'documents.read', 'app')).toEqual({ ok: true, value: '{}' });
        expect(await call(page, 'documents.removeProfile', '..')).toEqual(failure('invalid-argument'));
      });
    });

    test.describe('pictures', () => {
      test('a saved picture lists in the gallery and reads back with its thumbnail', async () => {
        const saved = await savePicture(page);
        expect(saved).toEqual({ id: expect.stringMatching(/^[a-z0-9-]+$/), updatedAt: expect.any(Number) });
        expect(await pictureIds(page, 'gallery')).toEqual([saved.id]);
        expect(await call(page, 'pictures.read', 'p1', saved.id, 'picture')).toEqual({ ok: true, value: PICTURE });
        expect(await call(page, 'pictures.read', 'p1', saved.id, 'thumbnail')).toEqual({ ok: true, value: THUMBNAIL });
      });

      test('saving under an id replaces that picture', async () => {
        const saved = await savePicture(page);
        unwrap(
          await call(page, 'pictures.save', 'p1', {
            id: saved.id,
            png: bytes(OTHER_PICTURE),
            thumbnail: bytes(THUMBNAIL),
          }),
        );
        expect(await pictureIds(page, 'gallery')).toEqual([saved.id]);
        expect(await call(page, 'pictures.read', 'p1', saved.id, 'picture')).toEqual({
          ok: true,
          value: OTHER_PICTURE,
        });
      });

      test('saving under a new id the caller chose creates it, so a retried save stays one picture', async () => {
        const first = { id: 'chosen-id', png: bytes(PICTURE), thumbnail: bytes(THUMBNAIL) };
        expect(unwrap(await call(page, 'pictures.save', 'p1', first))).toMatchObject({ id: 'chosen-id' });
        unwrap(await call(page, 'pictures.save', 'p1', { ...first, png: bytes(OTHER_PICTURE) }));
        expect(await pictureIds(page, 'gallery')).toEqual(['chosen-id']);
        expect(await call(page, 'pictures.read', 'p1', 'chosen-id', 'picture')).toEqual({
          ok: true,
          value: OTHER_PICTURE,
        });
      });

      test('saving under the id of a trashed picture fails and leaves it in the trash', async () => {
        const saved = await savePicture(page);
        unwrap(await call(page, 'pictures.trash', 'p1', saved.id));
        expect(
          await call(page, 'pictures.save', 'p1', {
            id: saved.id,
            png: bytes(OTHER_PICTURE),
            thumbnail: bytes(THUMBNAIL),
          }),
        ).toEqual(failure('not-found'));
        expect(await pictureIds(page, 'gallery')).toEqual([]);
        expect(await call(page, 'pictures.read', 'p1', saved.id, 'picture')).toEqual({ ok: true, value: PICTURE });
      });

      test('a copy gets a new id and the same image', async () => {
        const saved = await savePicture(page);
        const copy = pictureSummary.parse(unwrap(await call(page, 'pictures.copy', 'p1', saved.id)));
        expect(copy.id).not.toBe(saved.id);
        expect((await pictureIds(page, 'gallery')).toSorted()).toEqual([saved.id, copy.id].toSorted());
        expect(await call(page, 'pictures.read', 'p1', copy.id, 'picture')).toEqual({ ok: true, value: PICTURE });
      });

      test('trash then restore puts a picture back, and a second restore fails', async () => {
        const saved = await savePicture(page);
        unwrap(await call(page, 'pictures.trash', 'p1', saved.id));
        expect(await pictureIds(page, 'gallery')).toEqual([]);
        expect(await pictureIds(page, 'trash')).toEqual([saved.id]);
        expect(await call(page, 'pictures.read', 'p1', saved.id, 'thumbnail')).toEqual({ ok: true, value: THUMBNAIL });
        expect(unwrap(await call(page, 'pictures.restore', 'p1', saved.id))).toMatchObject({ id: saved.id });
        expect(await pictureIds(page, 'gallery')).toEqual([saved.id]);
        expect(await pictureIds(page, 'trash')).toEqual([]);
        expect(await call(page, 'pictures.restore', 'p1', saved.id)).toEqual(failure('not-found'));
      });

      test('purge deletes only from the trash', async () => {
        const saved = await savePicture(page);
        expect(await call(page, 'pictures.purge', 'p1', saved.id)).toEqual(failure('not-found'));
        unwrap(await call(page, 'pictures.trash', 'p1', saved.id));
        unwrap(await call(page, 'pictures.purge', 'p1', saved.id));
        expect(await pictureIds(page, 'trash')).toEqual([]);
        expect(await call(page, 'pictures.read', 'p1', saved.id, 'picture')).toEqual(failure('not-found'));
      });

      test('a missing picture fails every call that needs it', async () => {
        expect(await call(page, 'pictures.read', 'p1', 'ghost', 'picture')).toEqual(failure('not-found'));
        expect(await call(page, 'pictures.copy', 'p1', 'ghost')).toEqual(failure('not-found'));
        expect(await call(page, 'pictures.trash', 'p1', 'ghost')).toEqual(failure('not-found'));
        expect(await call(page, 'pictures.list', 'nobody', 'gallery')).toEqual({ ok: true, value: [] });
      });

      test('refuses a stored thumbnail that is not a PNG', async () => {
        const saved = await savePicture(page);
        await target.damageThumbnail(session, 'p1', saved.id, [1, 2, 3, 4]);
        expect(await call(page, 'pictures.read', 'p1', saved.id, 'thumbnail')).toEqual(failure('io'));
        expect(await call(page, 'pictures.read', 'p1', saved.id, 'picture')).toEqual({ ok: true, value: PICTURE });
      });

      test('rejects bytes that are not a PNG and ids that are not safe', async () => {
        expect(await call(page, 'pictures.save', 'p1', { png: bytes([1, 2, 3]), thumbnail: bytes(THUMBNAIL) })).toEqual(
          failure('invalid-argument'),
        );
        expect(await call(page, 'pictures.list', '../p1', 'gallery')).toEqual(failure('invalid-argument'));
        expect(await call(page, 'pictures.read', 'p1', '../../app', 'picture')).toEqual(failure('invalid-argument'));
        expect(
          await call(page, 'pictures.save', 'p1', { id: '../app', png: bytes(PICTURE), thumbnail: bytes(THUMBNAIL) }),
        ).toEqual(failure('invalid-argument'));
        expect(await call(page, 'pictures.list', 'p1', 'recycle')).toEqual(failure('invalid-argument'));
        expect(await pictureIds(page, 'gallery')).toEqual([]);
      });
    });

    test.describe('window', () => {
      test('kiosk lock turns on and off and reports its state', async () => {
        expect(unwrap(await call(page, 'window.getState'))).toEqual({ fullscreen: false, kioskLock: false });
        expect(unwrap(await call(page, 'window.setKioskLock', true))).toMatchObject({ kioskLock: true });
        expect(unwrap(await call(page, 'window.setKioskLock', false))).toMatchObject({ kioskLock: false });
        expect(await call(page, 'window.setKioskLock', 'yes')).toEqual(failure('invalid-argument'));
        expect(await call(page, 'window.setFullscreen', 1)).toEqual(failure('invalid-argument'));
      });

      test('a close request can be acknowledged', async () => {
        expect(await call(page, 'window.acknowledgeCloseRequest')).toEqual({ ok: true, value: null });
      });
    });

    test.describe('export and print', () => {
      test('export saves the exact PNG bytes', async () => {
        const { outcome, saved } = await target.captureExport(session, () =>
          call(page, 'output.exportPicture', bytes(PICTURE), 'My picture'),
        );
        expect(outcome).toEqual({ ok: true, value: 'saved' });
        expect(saved).toEqual(PICTURE);
      });

      test('export rejects a file name with a path and bytes that are not a PNG', async () => {
        expect(await call(page, 'output.exportPicture', bytes(PICTURE), '../escape')).toEqual(
          failure('invalid-argument'),
        );
        expect(await call(page, 'output.exportPicture', bytes([1, 2]), 'My picture')).toEqual(
          failure('invalid-argument'),
        );
      });

      test('print shows the picture', async () => {
        const { outcome, printedWidth } = await target.capturePrint(session, () =>
          call(page, 'output.printPicture', bytes(PICTURE)),
        );
        expect(outcome).toEqual({ ok: true, value: 'printed' });
        expect(printedWidth).toBe(4);
      });

      test('print rejects bytes that are not a PNG', async () => {
        expect(await call(page, 'output.printPicture', bytes([0x89, 0x50]))).toEqual(failure('invalid-argument'));
      });
    });
  });
}
