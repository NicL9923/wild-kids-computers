import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileStore } from '../../../../electron/main/fileStore.ts';
import { createSessionStore, SESSION_CALL_DEADLINE_MS } from '../../../app/session/sessionStore.ts';
import { createFakeBridge } from '../../../app/session/testing/fakeBridge.ts';
import { createManualScheduler } from '../../../core/activityKit/scheduler.ts';
import { createScope } from '../../../core/activityKit/scope.ts';
import { rgba } from '../../../core/paint/color.ts';
import { createSurface } from '../../../core/paint/surface.ts';
import { appDocument } from '../../../core/storage/schemas.ts';
import { Autosaver, type EncodedPicture } from './autosave.ts';
import { StudioDocument } from './studioDocument.ts';

const PROFILE = { id: 'kid', avatarId: 'fox', colorId: 'sky', band: 'band-6-8' } as const;
const SIZE = 8;
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A PNG signature followed by the first pixel's red value, so a saved file shows which change it holds. */
function encode(studio: StudioDocument): Promise<EncodedPicture> {
  const png = Uint8Array.from([...SIGNATURE, studio.doc.paint.data[0] ?? 0]);
  return Promise.resolve({ png, thumbnail: png });
}

function paintAll(studio: StudioDocument, red: number): void {
  studio.replacePaint(createSurface(SIZE, SIZE, rgba(red, 0, 0)).data);
}

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'wkc-autosave-files-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('a first save whose answer comes after its deadline', () => {
  it('saves again into the same gallery picture instead of a second one', async () => {
    const files = createFileStore(root);
    await files.documents.write(
      'app',
      JSON.stringify({ ...appDocument.defaults(), firstLaunchDone: true, lastActiveProfileId: PROFILE.id }),
    );
    await files.documents.write('profiles', JSON.stringify({ version: 1, profiles: [PROFILE] }));
    // The first save commits on disk, then its answer waits until the test lets it go.
    const late = Promise.withResolvers<void>();
    const committed = Promise.withResolvers<void>();
    let saves = 0;
    const pictures = {
      ...files.pictures,
      async save(...args: Parameters<typeof files.pictures.save>) {
        const summary = await files.pictures.save(...args);
        saves += 1;
        if (saves === 1) {
          committed.resolve();
          await late.promise;
        }
        return summary;
      },
    };
    const timers = createManualScheduler({ wall: 0 });
    const store = createSessionStore({
      bridge: { ...createFakeBridge().bridge, documents: files.documents, pictures },
      timers,
    });
    await store.start();

    const studio = new StudioDocument(SIZE, SIZE);
    paintAll(studio, 10);
    const saver = new Autosaver(
      { scope: createScope(createManualScheduler({ wall: 0 })), delayMs: 1500, encode, save: store.pictures().save },
      { studio, id: null, savedVersion: 0 },
    );
    const first = saver.keep();
    await committed.promise;
    timers.advance(SESSION_CALL_DEADLINE_MS);
    expect(await first).toBe(false);

    // The child paints on, and the studio tries again while the first answer is still out.
    paintAll(studio, 20);
    const second = saver.keep();
    late.resolve();
    expect(await second).toBe(true);

    const gallery = await files.pictures.list(PROFILE.id, 'gallery');
    expect(gallery.map((picture) => picture.id)).toEqual([saver.pictureId]);
    const [only] = gallery;
    expect(only).toBeDefined();
    expect(await files.pictures.read(PROFILE.id, only?.id ?? '', 'picture')).toEqual(
      Uint8Array.from([...SIGNATURE, 20]),
    );
    saver.dispose();
  });
});
