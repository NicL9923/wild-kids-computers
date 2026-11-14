import type * as FsPromises from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createFileStore } from '../../../electron/main/fileStore.ts';
import { createRandom } from '../../core/activityKit/random.ts';
import { createManualScheduler } from '../../core/activityKit/scheduler.ts';
import { documentNames, type DocumentName } from '../../core/platform/names.ts';
import { appDocument, settingsDocument, type Profile, type Settings } from '../../core/storage/schemas.ts';
import { createSessionStore, SESSION_CALL_DEADLINE_MS, type SessionStore } from './sessionStore.ts';
import { createFakeBridge } from './testing/fakeBridge.ts';

/**
 * The session store over the main process's real file store, with only the file system's rename
 * slowed. The rename is the moment a document write commits, so holding it is a write that passes
 * its deadline and lands later, the case where the renderer and the disk can disagree.
 */
const renames = vi.hoisted(() => ({
  /** Decides, for each rename into a target, whether it waits and for what. */
  hold: null as ((target: string) => Promise<void> | null) | null,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof FsPromises>();
  return {
    ...real,
    rename: async (from: string, to: string) => {
      const wait = renames.hold?.(to) ?? null;
      if (wait !== null) await wait;
      return real.rename(from, to);
    },
  };
});

const KID: Profile = { id: 'kid', avatarId: 'fox', colorId: 'sky', band: 'band-6-8' };
const PAL: Profile = { id: 'pal', avatarId: 'owl', colorId: 'fern', band: 'band-9-12' };

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'wkc-session-files-'));
  renames.hold = null;
});

afterEach(async () => {
  renames.hold = null;
  await rm(root, { recursive: true, force: true });
});

/** Lets the file system and every pending promise move on. */
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

async function startOverFiles(profiles: Profile[], voiceVolume: number) {
  const files = createFileStore(root);
  const app = { ...appDocument.defaults(), firstLaunchDone: true, lastActiveProfileId: profiles[0]?.id ?? null };
  await files.documents.write('app', JSON.stringify(app));
  await files.documents.write('profiles', JSON.stringify({ version: 1, profiles }));
  for (const profile of profiles) {
    const settings = { ...settingsDocument.defaults(), voiceVolume };
    await files.documents.write(documentNames.settings(profile.id), JSON.stringify(settings));
  }
  // Documents and pictures are the real file store. Nothing else of the bridge is used.
  const fake = createFakeBridge();
  let reading = 0;
  const documents = {
    ...files.documents,
    async read(name: DocumentName) {
      reading += 1;
      try {
        return await files.documents.read(name);
      } finally {
        reading -= 1;
      }
    },
  };
  const timers = createManualScheduler({ wall: 0 });
  const store = createSessionStore({ bridge: { ...fake.bridge, documents, pictures: files.pictures }, timers });
  await store.start();
  return { files, timers, store, readsRunning: () => reading > 0 };
}

/**
 * Waits for the active profile to load. Real file calls take real time, which a count of event
 * loop turns does not bound under load, so this waits for the store to say so.
 */
async function untilReady(store: SessionStore): Promise<void> {
  if (store.getSnapshot().status === 'ready') return;
  await new Promise<void>((resolve) => {
    const stop = store.subscribe(() => {
      if (store.getSnapshot().status !== 'ready') return;
      stop();
      resolve();
    });
  });
}

interface Volumes {
  readonly voiceVolume: number;
  readonly effectsVolume: number;
}

const volumes = ({ voiceVolume, effectsVolume }: Settings): Volumes => ({ voiceVolume, effectsVolume });

async function settingsOnDisk(files: ReturnType<typeof createFileStore>, profileId: string): Promise<Settings> {
  const text = await files.documents.read(documentNames.settings(profileId));
  if (text === null) throw new Error(`No settings saved for ${profileId}`);
  return settingsDocument.schema.parse(JSON.parse(text));
}

describe('a document write that passes its deadline', () => {
  it('keeps the changed value through a profile switch and lands it before the next write', async () => {
    const { files, timers, store } = await startOverFiles([KID], 0.2);
    const settingsFile = path.join(root, 'profile', KID.id, 'settings.json');
    const reached = Promise.withResolvers<void>();
    const released = Promise.withResolvers<void>();
    renames.hold = (target) => {
      if (target !== settingsFile) return null;
      renames.hold = null;
      reached.resolve();
      return released.promise;
    };

    store.updateSettings({ voiceVolume: 0.8 });
    await reached.promise;
    timers.advance(SESSION_CALL_DEADLINE_MS);
    await turn();
    // The child and the adult are told the save has not landed.
    expect(store.getSnapshot().saveProblem).toMatchObject({ target: documentNames.settings(KID.id), code: 'io' });

    store.chooseProfile(null);
    store.chooseProfile(KID.id);
    await untilReady(store);
    // The disk still has 0.2, but the write of 0.8 is on its way, so memory keeps 0.8.
    expect(store.getSnapshot().settings.voiceVolume).toBe(0.8);

    store.updateSettings({ effectsVolume: 0.3 });
    released.resolve();
    await store.flush();
    expect(await settingsOnDisk(files, KID.id)).toMatchObject({ voiceVolume: 0.8, effectsVolume: 0.3 });
    expect(store.getSnapshot().settings).toMatchObject({ voiceVolume: 0.8, effectsVolume: 0.3 });
  });

  it('ends with memory and disk in step through random late writes, profile switches, and reads', async () => {
    const fields = ['voiceVolume', 'effectsVolume'] as const;
    for (let seed = 1; seed <= 12; seed++) {
      await rm(root, { recursive: true, force: true });
      root = await mkdtemp(path.join(os.tmpdir(), 'wkc-session-files-'));
      const random = createRandom(seed);
      const profiles = [KID, PAL];
      const { files, timers, store, readsRunning } = await startOverFiles(profiles, 0.5);
      // Every settings rename waits until the test lets it go, some past the deadline.
      const parked: Array<() => void> = [];
      renames.hold = (target) =>
        target.endsWith(`${path.sep}settings.json`) ? new Promise<void>((resolve) => parked.push(resolve)) : null;
      const expected = new Map(profiles.map((p) => [p.id, { voiceVolume: 0.5, effectsVolume: 0.6 }]));
      let activeId: string | null = KID.id;
      const shown: Array<{ step: number; settings: Volumes; expected: Volumes | undefined }> = [];

      for (let step = 0; step < 60; step++) {
        const roll = random.next();
        if (roll < 0.2) {
          activeId = random.next() < 0.2 ? null : random.pick(profiles).id;
          store.chooseProfile(activeId);
        } else if (roll < 0.5 && activeId !== null) {
          const update = { [random.pick(fields)]: random.int(0, 10) / 10 };
          store.updateSettings(update);
          expected.set(activeId, {
            ...(expected.get(activeId) ?? { voiceVolume: 0.5, effectsVolume: 0.6 }),
            ...update,
          });
        } else if (roll < 0.7) {
          // Only writes pass their deadline here. A read that passes it leaves the profile
          // unopened, which "a profile document that could not be read" covers.
          while (readsRunning()) await turn();
          timers.advance(SESSION_CALL_DEADLINE_MS);
        } else if (roll < 0.9) {
          parked.splice(random.int(0, Math.max(parked.length - 1, 0)), 1)[0]?.();
        } else if (activeId !== null && store.getSnapshot().status === 'ready') {
          // What the child sees includes every update, whatever the disk holds.
          shown.push({ step, settings: volumes(store.getSnapshot().settings), expected: expected.get(activeId) });
        }
        await turn();
      }

      renames.hold = null;
      for (const release of parked.splice(0)) release();
      await store.flush();
      for (const profile of profiles) {
        expect(await settingsOnDisk(files, profile.id), `seed ${seed}, ${profile.id} on disk`).toMatchObject(
          expected.get(profile.id) ?? {},
        );
      }
      const last = activeId === null ? null : expected.get(activeId);
      expect(activeId === null ? null : volumes(store.getSnapshot().settings), `seed ${seed}, in memory`).toEqual(last);
      expect(
        shown.filter(
          (seen) =>
            seen.settings.voiceVolume !== seen.expected?.voiceVolume ||
            seen.settings.effectsVolume !== seen.expected.effectsVolume,
        ),
        `seed ${seed}, shown while writes were late`,
      ).toEqual([]);
      // Every write landed, so nothing is left to report.
      expect(store.getSnapshot().saveProblem, `seed ${seed}`).toBeNull();
    }
  });
});

describe('a profile document that could not be read', () => {
  it('writes nothing over settings and progress whose reads passed the deadline, and opens them on try again', async () => {
    const files = createFileStore(root);
    const app = { ...appDocument.defaults(), firstLaunchDone: true, lastActiveProfileId: KID.id };
    await files.documents.write('app', JSON.stringify(app));
    await files.documents.write('profiles', JSON.stringify({ version: 1, profiles: [KID, PAL] }));
    const settings = { ...settingsDocument.defaults(), voiceVolume: 0.2, sessionLengthMinutes: 15 };
    await files.documents.write(documentNames.settings(KID.id), JSON.stringify(settings));
    const progress = { version: 1, activities: { old: { recentRounds: [], daysPracticed: [], furthestStep: 7 } } };
    await files.documents.write(documentNames.progress(KID.id), JSON.stringify(progress));
    const before = await Promise.all([
      files.documents.read(documentNames.settings(KID.id)),
      files.documents.read(documentNames.progress(KID.id)),
    ]);

    // The reads of the child's documents answer only after their deadline.
    const gate = Promise.withResolvers<void>();
    const bothHeld = Promise.withResolvers<void>();
    let held = 0;
    const documents = {
      ...files.documents,
      async read(name: DocumentName) {
        const text = await files.documents.read(name);
        if (name.startsWith(`profile/${KID.id}/`)) {
          held += 1;
          if (held === 2) bothHeld.resolve();
          await gate.promise;
        }
        return text;
      },
    };
    const timers = createManualScheduler({ wall: 0 });
    const store = createSessionStore({
      bridge: { ...createFakeBridge().bridge, documents, pictures: files.pictures },
      timers,
    });
    const started = store.start();
    await bothHeld.promise;
    timers.advance(SESSION_CALL_DEADLINE_MS);
    await started;

    // What the reviewer's probe did next: a mute change and a recorded step. No profile is active.
    expect(() => store.updateSettings({ muted: true })).toThrow(/needs an active profile/);
    expect(() => store.recordStep('new', 1)).toThrow(/needs an active profile/);
    gate.resolve();
    await store.flush();
    expect(
      await Promise.all([
        files.documents.read(documentNames.settings(KID.id)),
        files.documents.read(documentNames.progress(KID.id)),
      ]),
    ).toEqual(before);
    // The child is not shown defaults in place of their own settings: the app says it could not
    // open the saved things, and trying again opens them.
    expect(store.getSnapshot()).toMatchObject({ status: 'unavailable', activeProfile: null });

    await store.retryStart();
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', activeProfile: KID });
    expect(store.getSnapshot().settings).toMatchObject({ voiceVolume: 0.2, sessionLengthMinutes: 15 });
    expect(store.progressOf('old')).toMatchObject({ furthestStep: 7 });
  });
});

/** A picture file: the PNG signature and one byte that tells pictures apart. */
const png = (value: number) => Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, value]);

/** Kid and pal, each with settings and one picture, on the real file store. */
async function twoChildren() {
  const files = createFileStore(root);
  const app = { ...appDocument.defaults(), firstLaunchDone: true, lastActiveProfileId: KID.id };
  await files.documents.write('app', JSON.stringify(app));
  await files.documents.write('profiles', JSON.stringify({ version: 1, profiles: [KID, PAL] }));
  for (const profile of [KID, PAL]) {
    await files.documents.write(documentNames.settings(profile.id), JSON.stringify(settingsDocument.defaults()));
    await files.pictures.save(profile.id, { id: `${profile.id}-art`, png: png(1), thumbnail: png(2) });
  }
  return files;
}

function sessionOver(files: ReturnType<typeof createFileStore>, documents = files.documents) {
  const timers = createManualScheduler({ wall: 0 });
  const store = createSessionStore({
    bridge: { ...createFakeBridge().bridge, documents, pictures: files.pictures },
    timers,
  });
  return { store, timers };
}

/** Every profile the saved list names, with its settings and pictures, as they are on disk. */
async function listedOnDisk(files: ReturnType<typeof createFileStore>) {
  const text = await files.documents.read('profiles');
  const listed = z.object({ profiles: z.array(z.object({ id: z.string() })) }).parse(JSON.parse(text ?? '{}'));
  return Promise.all(
    listed.profiles.map(async ({ id }) => ({
      id,
      settings: (await files.documents.read(documentNames.settings(id))) !== null,
      pictures: (await files.pictures.list(id, 'gallery')).map((picture) => picture.id).toSorted(),
    })),
  );
}

describe('removing a profile', () => {
  it('never deletes the files of a listed profile when its deletion lands after the deadline', async () => {
    const files = await twoChildren();
    const gate = Promise.withResolvers<void>();
    const reached = Promise.withResolvers<void>();
    const documents = {
      ...files.documents,
      async removeProfile(profileId: string) {
        reached.resolve();
        await gate.promise;
        await files.documents.removeProfile(profileId);
      },
    };
    const { store, timers } = sessionOver(files, documents);
    await store.start();
    await untilReady(store);
    const removal = store.deleteProfile(KID.id);
    await reached.promise;
    timers.advance(SESSION_CALL_DEADLINE_MS);
    await removal;
    // What the reviewer's probe did next, when it could: the child works on in the profile.
    if (store.getSnapshot().profiles.some((p) => p.id === KID.id)) {
      store.chooseProfile(KID.id);
      await untilReady(store);
      store.updateSettings({ voiceVolume: 0.9 });
      await store.pictures().save({ id: 'fresh-work', png: png(3), thumbnail: png(4) });
    }
    gate.resolve();
    await store.flush();

    for (const profile of await listedOnDisk(files)) {
      expect(profile, `${profile.id} is listed`).toMatchObject({ settings: true });
      expect(profile.pictures, `${profile.id} is listed`).toContain(`${profile.id}-art`);
    }
    expect(store.getSnapshot().profiles.map((p) => p.id)).toEqual([PAL.id]);
  });

  it('waits for a list write that lands after its deadline, and only then says the profile is removed', async () => {
    const files = await twoChildren();
    // The write reaches the disk, but its answer comes long after the deadline.
    const written = Promise.withResolvers<void>();
    const answer = Promise.withResolvers<void>();
    const documents = {
      ...files.documents,
      async write(name: DocumentName, text: string) {
        await files.documents.write(name, text);
        if (name !== 'profiles') return;
        written.resolve();
        await answer.promise;
      },
    };
    const { store, timers } = sessionOver(files, documents);
    await store.start();
    await untilReady(store);
    let outcome: unknown = null;
    void store.deleteProfile(KID.id).then((result) => (outcome = result));
    await written.promise;
    timers.advance(SESSION_CALL_DEADLINE_MS * 10);
    await turn();
    // Not reported as failed: the removal may already be on disk, and here it is.
    expect(outcome).toBeNull();
    expect(store.getSnapshot()).toMatchObject({ activeProfile: KID, profiles: [KID, PAL] });

    answer.resolve();
    await store.flush();
    expect(outcome).toEqual({ ok: true, value: undefined });
    expect(store.getSnapshot()).toMatchObject({ activeProfile: null, profiles: [PAL] });

    const next = sessionOver(files);
    await next.store.start();
    await next.store.flush();
    expect(next.store.getSnapshot().profiles).toEqual([PAL]);
    expect(await listedOnDisk(files)).toEqual([{ id: PAL.id, settings: true, pictures: [`${PAL.id}-art`] }]);
  });
});

describe('creating a profile', () => {
  it('makes a new profile usable only once the list that names it is saved, so the next start keeps its work', async () => {
    const files = await twoChildren();
    let failList = true;
    const written: string[] = [];
    const documents = {
      ...files.documents,
      write(name: DocumentName, text: string) {
        if (name === 'profiles' && failList) {
          failList = false;
          return Promise.reject(new Error('disk full'));
        }
        written.push(name);
        return files.documents.write(name, text);
      },
    };
    const { store } = sessionOver(files, documents);
    await store.start();
    await untilReady(store);

    const kid = { avatarId: 'cat', colorId: 'sun', band: 'band-3-5' } as const;
    const failed = await store.createProfile(kid);
    expect(store.getSnapshot().profiles).toEqual([KID, PAL]);
    expect(failed).toMatchObject({ ok: false, error: { message: 'disk full' } });
    await store.flush();
    expect(written.filter((name) => name !== 'app')).toEqual([]);

    // The adult tries again.
    const created = await store.createProfile(kid);
    if (!created.ok) throw created.error;
    store.chooseProfile(created.value.id);
    await untilReady(store);
    store.updateSettings({ voiceVolume: 0.9 });
    expect(await store.pictures().save({ id: 'fresh-art', png: png(3), thumbnail: png(4) })).toMatchObject({
      ok: true,
    });
    await store.flush();

    const next = sessionOver(files);
    await next.store.start();
    await next.store.flush();
    expect(next.store.getSnapshot().profiles.map((p) => p.id)).toEqual([KID.id, PAL.id, created.value.id]);
    expect(await listedOnDisk(files)).toContainEqual({ id: created.value.id, settings: true, pictures: ['fresh-art'] });
    expect(await settingsOnDisk(files, created.value.id)).toMatchObject({ voiceVolume: 0.9 });
  });
});
