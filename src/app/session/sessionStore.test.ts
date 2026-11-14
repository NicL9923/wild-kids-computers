import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAudioEngine, type AudioEngine } from '../../audio/audioEngine.ts';
import { CONTINUOUS } from '../../audio/sfx/continuous.ts';
import { ONE_SHOTS } from '../../audio/sfx/oneShots.ts';
import { BridgeError } from '../../core/platform/bridge.ts';
import { documentNames, type DocumentName } from '../../core/platform/names.ts';
import type { DocumentSpec } from '../../core/storage/document.ts';
import {
  activityStateDocument,
  appDocument,
  MAX_PROFILES,
  profilesDocument,
  progressDocument,
  settingsDocument,
  type Profile,
  type Settings,
} from '../../core/storage/schemas.ts';
import { createRandom } from '../../core/activityKit/random.ts';
import { createSessionStore, type SessionStore } from './sessionStore.ts';
import { createFakeBridge, type FakeBridge, type FakeBridgeOptions } from './testing/fakeBridge.ts';

const FOX: Profile = { id: 'fox-kid', avatarId: 'fox', colorId: 'sky', band: 'band-6-8' };
const OWL: Profile = { id: 'owl-kid', avatarId: 'owl', colorId: 'fern', band: 'band-9-12', name: 'Ada' };

const json = (value: unknown) => JSON.stringify(value);

/** Saved documents for a finished first launch with the given profiles. */
function savedApp(profiles: Profile[], lastActive: string | null, extra: Partial<Settings> = {}) {
  const documents: Partial<Record<DocumentName, string>> = {
    app: json({ ...appDocument.defaults(), firstLaunchDone: true, lastActiveProfileId: lastActive }),
    profiles: json({ version: 1, profiles }),
  };
  for (const profile of profiles) {
    documents[documentNames.settings(profile.id)] = json({ ...settingsDocument.defaults(), ...extra });
  }
  return documents;
}

function createClock() {
  const clock = { wall: new Date(2026, 10, 13, 10, 0).getTime(), mono: 5_000 };
  return { clock, sessionClock: { now: () => clock.wall, monotonic: () => clock.mono } };
}

function createTestAudio(): AudioEngine {
  return createAudioEngine({
    environment: {
      createContext: () => null,
      clipUrl: () => undefined,
      fetchClip: () => Promise.reject(new Error('no clips in unit tests')),
      now: () => 0,
    },
    sfx: { oneShots: ONE_SHOTS, continuous: CONTINUOUS },
    testLog: false,
  });
}

interface Harness {
  fake: FakeBridge;
  store: SessionStore;
  clock: { wall: number; mono: number };
  audio: AudioEngine;
}

async function startSession(options: FakeBridgeOptions = {}): Promise<Harness> {
  const fake = createFakeBridge(options);
  const { clock, sessionClock } = createClock();
  const audio = createTestAudio();
  const store = createSessionStore({ bridge: fake.bridge, audio, clock: sessionClock });
  await store.start();
  return { fake, store, clock, audio };
}

function savedJson(fake: FakeBridge, name: DocumentName): unknown {
  const text = fake.documents.get(name);
  if (text === undefined) throw new Error(`${name} was never written`);
  const value: unknown = JSON.parse(text);
  return value;
}

/** A saved document, checked with its own schema, so the test also proves the next load accepts it. */
function saved<T>(fake: FakeBridge, name: DocumentName, spec: DocumentSpec<T>): T {
  return spec.schema.parse(savedJson(fake, name));
}

/** Lets every pending promise and timer run, so a test sees what is still blocked. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Parks every document read that matches, so a test decides when each one finishes. Reads are
 * the I/O edge, so the store's own code runs for real around them.
 */
function holdReads(fake: FakeBridge, matches: (name: DocumentName) => boolean) {
  const read = fake.bridge.documents.read;
  const parked: Array<() => void> = [];
  let releasing = false;
  fake.bridge.documents.read = async (name) => {
    const text = await read(name);
    if (!releasing && matches(name)) await new Promise<void>((resolve) => parked.push(resolve));
    return text;
  };
  return {
    async reach(count: number): Promise<void> {
      while (parked.length < count) await settle();
    },
    /** Lets the parked read at this position, modulo the number parked, finish. */
    releaseOne(position: number): void {
      if (parked.length === 0) return;
      parked.splice(position % parked.length, 1)[0]?.();
    },
    releaseAll(): void {
      for (const release of parked.splice(0)) release();
    },
    /** Lets every read finish, including reads that start while the earlier ones finish. */
    async drain(): Promise<void> {
      releasing = true;
      this.releaseAll();
      await settle();
    },
  };
}

/** Waits until the store's snapshot passes the check. */
async function until(store: SessionStore, check: () => boolean): Promise<void> {
  if (check()) return;
  await new Promise<void>((resolve) => {
    const stop = store.subscribe(() => {
      if (!check()) return;
      stop();
      resolve();
    });
  });
}

describe('session start', () => {
  it('asks for first launch when nothing is saved', async () => {
    const { store } = await startSession();
    expect(store.getSnapshot()).toMatchObject({ status: 'needs-first-launch', profiles: [], activeProfile: null });
  });

  it('sets a corrupt profiles document aside and asks for first launch instead of crashing', async () => {
    const { store, fake } = await startSession({
      documents: {
        app: json({ ...appDocument.defaults(), firstLaunchDone: true }),
        profiles: '{"version":1,"profiles":[{',
      },
    });
    const snapshot = store.getSnapshot();
    expect(snapshot.status).toBe('needs-first-launch');
    expect(snapshot.profiles).toEqual([]);
    expect(fake.setAside).toEqual(['profiles']);
    expect(snapshot.loadProblems).toEqual([
      { document: 'profiles', status: 'reset', problem: expect.stringMatching(/^invalid-json/) },
    ]);
  });

  it('records a document the platform could not read and still starts', async () => {
    const fake = createFakeBridge();
    fake.failNext('read', 'app', new BridgeError('io', 'disk unplugged'));
    const store = createSessionStore({ bridge: fake.bridge });
    await store.start();
    expect(store.getSnapshot().status).toBe('needs-first-launch');
    expect(store.getSnapshot().loadProblems).toEqual([
      { document: 'app', status: 'unreadable', problem: 'disk unplugged' },
    ]);
  });

  it('asks for a profile when the last active one no longer exists', async () => {
    const { store } = await startSession({ documents: savedApp([FOX], 'gone-kid') });
    expect(store.getSnapshot()).toMatchObject({ status: 'needs-profile', activeProfile: null });
  });

  it('resumes the last active profile with its settings, band, and test info', async () => {
    const { store } = await startSession({
      documents: savedApp([FOX, OWL], OWL.id, { textSize: 'larger', reducedMotion: 'on' }),
      test: { seed: 7, difficulty: 3 },
    });
    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      activeProfile: OWL,
      testInfo: { seed: 7, difficulty: 3 },
      theme: { band: 'band-9-12', textSize: 'larger', letterSpacing: 'standard', reducedMotion: 'on' },
    });
  });

  it('uses the youngest band and default settings with no active profile', async () => {
    const { store } = await startSession({ documents: savedApp([OWL], null) });
    expect(store.getSnapshot().theme).toEqual({
      band: 'band-3-5',
      textSize: 'standard',
      letterSpacing: 'standard',
      reducedMotion: 'system',
    });
    expect(store.getSnapshot().testInfo).toBeNull();
  });

  it('turns the saved kiosk lock back on for the window', async () => {
    const turnedOn: boolean[] = [];
    const documents = savedApp([FOX], FOX.id);
    documents.app = json({ ...appDocument.defaults(), firstLaunchDone: true, kioskLock: true });
    await startSession({
      documents,
      window: {
        setKioskLock: (on) => {
          turnedOn.push(on);
          return Promise.resolve({ fullscreen: on, kioskLock: on });
        },
      },
    });
    expect(turnedOn).toEqual([true]);
  });
});

describe('choosing a profile', () => {
  it('loads the chosen profile and remembers it as the last active one', async () => {
    const { store, fake } = await startSession({ documents: savedApp([FOX, OWL], null) });
    store.chooseProfile(FOX.id);
    expect(store.getSnapshot().status).toBe('loading');
    await until(store, () => store.getSnapshot().status === 'ready');
    expect(store.getSnapshot().activeProfile).toEqual(FOX);
    await store.flush();
    expect(saved(fake, 'app', appDocument).lastActiveProfileId).toBe(FOX.id);

    store.chooseProfile(null);
    expect(store.getSnapshot()).toMatchObject({ status: 'needs-profile', activeProfile: null });
    await store.flush();
    expect(saved(fake, 'app', appDocument).lastActiveProfileId).toBeNull();
  });

  it('rejects an id that is not a profile', async () => {
    const { store } = await startSession({ documents: savedApp([FOX], null) });
    expect(() => store.chooseProfile('nobody')).toThrow(/No profile with id nobody/);
    expect(store.getSnapshot().activeProfile).toBeNull();
  });

  it('applies the newer profile when two choices race', async () => {
    const { store } = await startSession({ documents: savedApp([FOX, OWL], null) });
    store.chooseProfile(FOX.id);
    store.chooseProfile(OWL.id);
    await until(store, () => store.getSnapshot().status === 'ready');
    await store.flush();
    expect(store.getSnapshot().activeProfile?.id).toBe(OWL.id);
    expect(store.getSnapshot().theme.band).toBe('band-9-12');
  });
});

describe('profiles', () => {
  it('creates, renames, and lists a profile without making it active', async () => {
    const { store, fake } = await startSession({ documents: savedApp([FOX], null) });
    const created = store.createProfile({ avatarId: 'bee', colorId: 'sun', band: 'band-3-5' });
    store.updateProfile(created.id, { name: 'Mo' });
    expect(store.getSnapshot().profiles).toEqual([FOX, { ...created, name: 'Mo' }]);
    expect(store.getSnapshot().activeProfile).toBeNull();
    await store.flush();
    expect(saved(fake, 'profiles', profilesDocument).profiles.at(-1)).toEqual({ ...created, name: 'Mo' });
  });

  it.each([
    [
      'an unknown profile id',
      (store: SessionStore) => store.updateProfile('nobody', { name: 'X' }),
      /No profile with id/,
    ],
    ['a name that is too long', (store: SessionStore) => store.updateProfile(FOX.id, { name: 'x'.repeat(41) }), /name/],
    [
      'an unknown band',
      (store: SessionStore) => store.updateProfile(FOX.id, JSON.parse('{"band":"band-1-2"}')),
      /band/,
    ],
  ])('refuses %s and keeps the saved list', async (_case, act, reason) => {
    const { store } = await startSession({ documents: savedApp([FOX], null) });
    expect(() => act(store)).toThrow(reason);
    expect(store.getSnapshot().profiles).toEqual([FOX]);
  });

  it('refuses a profile past the limit', async () => {
    const many = Array.from({ length: MAX_PROFILES }, (_, i) => ({ ...FOX, id: `kid-${i}` }));
    const { store } = await startSession({ documents: savedApp(many, null) });
    expect(() => store.createProfile({ avatarId: 'bee', colorId: 'sun', band: 'band-3-5' })).toThrow(/24/);
    expect(store.getSnapshot().profiles).toHaveLength(MAX_PROFILES);
  });

  it('deletes the active profile with its documents and pictures after its pending writes land', async () => {
    const { store, fake } = await startSession({ documents: savedApp([FOX, OWL], FOX.id) });
    const pictures = store.pictures();
    await pictures.save({ png: new Uint8Array([1]), thumbnail: new Uint8Array([2]) });
    fake.holdWrites();
    store.updateSettings({ muted: true });

    const deleting = store.deleteProfile(FOX.id);
    expect(store.getSnapshot()).toMatchObject({ status: 'needs-profile', activeProfile: null });
    // The held settings write must finish before the removal, or it would bring the files back.
    await fake.heldWritesReach(2);
    await settle();
    expect(fake.calls).not.toContain(`documents.removeProfile ${FOX.id}`);
    fake.resumeWrites();
    await expect(deleting).resolves.toEqual({ ok: true, value: undefined });

    const settingsWrite = fake.calls.indexOf(`documents.write ${documentNames.settings(FOX.id)}`);
    expect(settingsWrite).toBeGreaterThan(-1);
    expect(fake.calls.indexOf(`documents.removeProfile ${FOX.id}`)).toBeGreaterThan(settingsWrite);
    expect(fake.pictureIds(FOX.id, 'gallery')).toEqual([]);
    expect(store.getSnapshot().profiles).toEqual([OWL]);

    await store.flush();
    expect(saved(fake, 'profiles', profilesDocument).profiles).toEqual([OWL]);
    expect(saved(fake, 'app', appDocument).lastActiveProfileId).toBeNull();
    expect([...fake.documents.keys()].filter((name) => name.startsWith(`profile/${FOX.id}/`))).toEqual([]);
  });

  it('asks for first launch after the last profile is deleted', async () => {
    const { store } = await startSession({ documents: savedApp([FOX], FOX.id) });
    await store.deleteProfile(FOX.id);
    expect(store.getSnapshot().status).toBe('needs-first-launch');
  });

  it('refuses picture changes for a profile that is being deleted', async () => {
    const { store, fake } = await startSession({ documents: savedApp([FOX], FOX.id) });
    const pictures = store.pictures();
    await store.deleteProfile(FOX.id);
    const result = await pictures.save({ png: new Uint8Array([1]), thumbnail: new Uint8Array([2]) });
    expect(result).toMatchObject({ ok: false, error: { code: 'not-found' } });
    expect(fake.calls).not.toContain(`pictures.save ${FOX.id}`);
  });

  it('refuses to make a profile active while it is being deleted', async () => {
    const { store, fake } = await startSession({ documents: savedApp([FOX, OWL], FOX.id) });
    fake.holdWrites();
    store.updateSettings({ muted: true });
    const deleting = store.deleteProfile(FOX.id);
    expect(() => store.chooseProfile(FOX.id)).toThrow(/Profile fox-kid is being deleted/);
    expect(store.getSnapshot().activeProfile).toBeNull();
    fake.resumeWrites();
    await deleting;
    expect(store.getSnapshot().activeProfile).toBeNull();
  });

  it('lets a profile be chosen again after its deletion failed', async () => {
    const { store, fake } = await startSession({ documents: savedApp([FOX, OWL], null) });
    fake.failNext('removeProfile', FOX.id, new BridgeError('io', 'disk full'));
    await store.deleteProfile(FOX.id);
    store.chooseProfile(FOX.id);
    expect(store.getSnapshot().activeProfile).toEqual(FOX);
  });

  it('keeps a profile whose files could not be removed and says why', async () => {
    const { store, fake } = await startSession({ documents: savedApp([FOX, OWL], null) });
    fake.failNext('removeProfile', FOX.id, new BridgeError('io', 'disk full'));
    const result = await store.deleteProfile(FOX.id);
    expect(result).toMatchObject({ ok: false, error: { code: 'io', message: 'disk full' } });
    expect(store.getSnapshot().profiles).toEqual([FOX, OWL]);
    expect(store.getSnapshot().saveProblem).toEqual({
      target: `profile/${FOX.id}`,
      operation: 'remove-profile',
      code: 'io',
      message: 'disk full',
    });
  });
});

describe('writes', () => {
  it('lands two quick updates, in order, with the newest value last', async () => {
    const { store, fake } = await startSession({ documents: savedApp([FOX], FOX.id) });
    fake.holdWrites();
    store.updateSettings({ muted: true });
    store.updateSettings({ voiceVolume: 0.25 });
    store.updateSettings((current) => ({ ...current, effectsVolume: current.voiceVolume }));
    expect(store.getSnapshot().settings).toMatchObject({ muted: true, voiceVolume: 0.25, effectsVolume: 0.25 });

    // The first write is in flight. The other two updates wait and go out as one write.
    await fake.heldWritesReach(1);
    const [first] = fake.heldWrites;
    expect(JSON.parse(first?.text ?? '')).toMatchObject({ muted: true, voiceVolume: 0.25, effectsVolume: 0.25 });
    store.updateSettings({ letterSpacing: 'wide' });
    first?.release();
    await fake.heldWritesReach(2);
    fake.heldWrites[1]?.release();
    await store.flush();

    expect(saved(fake, documentNames.settings(FOX.id), settingsDocument)).toMatchObject({
      muted: true,
      voiceVolume: 0.25,
      effectsVolume: 0.25,
      letterSpacing: 'wide',
    });
    expect(fake.heldWrites).toHaveLength(2);
  });

  it('never lets a read that waited behind a write bring back the older value', async () => {
    const { store, fake } = await startSession({ documents: savedApp([FOX, OWL], FOX.id, { voiceVolume: 0.9 }) });
    fake.holdWrites();
    store.updateSettings({ voiceVolume: 0.1 });
    await fake.heldWritesReach(1);
    expect(fake.heldWrites[0]?.name).toBe(documentNames.settings(FOX.id));

    // Leave and come back while the write is still in flight. The new read must wait for it.
    store.chooseProfile(OWL.id);
    store.chooseProfile(FOX.id);
    await settle();
    expect(store.getSnapshot().status).toBe('loading');
    fake.resumeWrites();
    await until(store, () => store.getSnapshot().status === 'ready');
    await store.flush();

    expect(store.getSnapshot().settings.voiceVolume).toBe(0.1);
    const name = documentNames.settings(FOX.id);
    const writeAt = fake.calls.indexOf(`documents.write ${name}`);
    expect(fake.calls.lastIndexOf(`documents.read ${name}`)).toBeGreaterThan(writeAt);
  });

  it('applies an update made before the profile finished loading to the saved settings', async () => {
    const { store, fake } = await startSession({ documents: savedApp([FOX], null, { voiceVolume: 0.3 }) });
    store.chooseProfile(FOX.id);
    store.updateSettings({ muted: true });
    await until(store, () => store.getSnapshot().status === 'ready');
    await store.flush();
    expect(store.getSnapshot().settings).toMatchObject({ voiceVolume: 0.3, muted: true });
    expect(saved(fake, documentNames.settings(FOX.id), settingsDocument)).toMatchObject({
      voiceVolume: 0.3,
      muted: true,
    });
  });

  it('saves an update made while loading even when the profile is left and chosen again before the load ends', async () => {
    const { store, fake } = await startSession({
      documents: savedApp([FOX, OWL], null, { voiceVolume: 0.8 }),
    });
    const name = documentNames.settings(FOX.id);
    const reads = holdReads(fake, (read) => read === name);
    store.chooseProfile(FOX.id);
    await reads.reach(1);
    store.updateSettings({ voiceVolume: 0.2 });
    store.chooseProfile(OWL.id);
    store.chooseProfile(FOX.id);
    reads.releaseAll();
    await reads.drain();
    await until(store, () => store.getSnapshot().status === 'ready');
    await store.flush();

    expect(store.getSnapshot().settings.voiceVolume).toBe(0.2);
    expect(saved(fake, name, settingsDocument).voiceVolume).toBe(0.2);
  });

  it('keeps memory and disk in step through random profile switches, updates, and slow reads', async () => {
    const profiles: Profile[] = [FOX, OWL, { ...FOX, id: 'cat-kid', avatarId: 'cat' }];
    // Updates change one field at a time, so a stale copy of another field shows up on disk.
    const fields = ['voiceVolume', 'effectsVolume'] as const;
    for (let seed = 1; seed <= 20; seed++) {
      const random = createRandom(seed);
      const { store, fake } = await startSession({ documents: savedApp(profiles, null, { voiceVolume: 0.5 }) });
      const reads = holdReads(fake, (read) => read.startsWith('profile/'));
      // What each profile's settings must end as: every update applied in the order it was made.
      const expected = new Map(profiles.map((profile) => [profile.id, { voiceVolume: 0.5, effectsVolume: 0.6 }]));
      let activeId: string | null = null;
      for (let step = 0; step < 80; step++) {
        const roll = random.next();
        if (roll < 0.25) {
          activeId = random.pick(profiles).id;
          store.chooseProfile(activeId);
        } else if (roll < 0.6 && activeId !== null) {
          const update = { [random.pick(fields)]: random.int(0, 10) / 10 };
          store.updateSettings(update);
          const before = expected.get(activeId) ?? { voiceVolume: 0.5, effectsVolume: 0.6 };
          expected.set(activeId, { ...before, ...update });
        } else if (roll < 0.85) {
          reads.releaseOne(random.int(0, 1_000));
        }
        if (random.next() < 0.5) await settle();
      }
      await reads.drain();
      await store.flush();

      for (const profile of profiles) {
        const disk = saved(fake, documentNames.settings(profile.id), settingsDocument);
        expect(disk, `seed ${seed}, ${profile.id} on disk`).toMatchObject(expected.get(profile.id) ?? {});
      }
      if (activeId !== null) {
        expect(store.getSnapshot().settings, `seed ${seed}, in memory`).toMatchObject(expected.get(activeId) ?? {});
      }
    }
  });

  it('shows a failed write as a problem, keeps the change on screen, and clears it after the next write', async () => {
    const { store, fake } = await startSession({ documents: savedApp([FOX], FOX.id) });
    const name = documentNames.settings(FOX.id);
    fake.failNext('write', name, new BridgeError('io', 'disk full'));
    store.updateSettings({ muted: true });
    await store.flush();
    expect(store.getSnapshot().saveProblem).toEqual({
      target: name,
      operation: 'write',
      code: 'io',
      message: 'disk full',
    });
    expect(store.getSnapshot().settings.muted).toBe(true);

    store.updateSettings({ voiceVolume: 0.5 });
    await store.flush();
    expect(store.getSnapshot().saveProblem).toBeNull();
    expect(saved(fake, name, settingsDocument)).toMatchObject({ muted: true, voiceVolume: 0.5 });
  });

  it('refuses a bad settings value before anything changes', async () => {
    const { store, fake } = await startSession({ documents: savedApp([FOX], FOX.id) });
    expect(() => store.updateSettings({ voiceVolume: 2 })).toThrow(/voiceVolume/);
    expect(store.getSnapshot().settings.voiceVolume).toBe(1);
    await store.flush();
    expect(fake.calls).not.toContain(`documents.write ${documentNames.settings(FOX.id)}`);
  });

  it('refuses settings changes with no active profile', async () => {
    const { store } = await startSession({ documents: savedApp([FOX], null) });
    expect(() => store.updateSettings({ muted: true })).toThrow(/needs an active profile/);
  });

  it('saves a kiosk lock change and reports a window that refused it', async () => {
    const { store, fake } = await startSession({
      documents: savedApp([FOX], FOX.id),
      window: { setKioskLock: () => Promise.reject(new BridgeError('forbidden', 'not the app frame')) },
    });
    const result = await store.setKioskLock(true);
    await store.flush();
    expect(result).toMatchObject({ ok: false, error: { code: 'forbidden' } });
    expect(saved(fake, 'app', appDocument).kioskLock).toBe(true);
    expect(store.getSnapshot().saveProblem).toMatchObject({ target: 'window', operation: 'kiosk-lock' });
  });
});

describe('progress', () => {
  it('records a round with the difficulty the kit computed, dated by the session clock', async () => {
    const { store, fake, clock } = await startSession({ documents: savedApp([FOX], FOX.id) });
    store.recordRound('pop-the-seed-pods', { mistakes: 1, hintsUsed: 0 }, 4);
    store.recordStep('typing-course', 2);
    await store.flush();
    expect(store.progressOf('pop-the-seed-pods')).toEqual({
      difficulty: 4,
      recentRounds: [{ mistakes: 1, hintsUsed: 0, at: clock.wall }],
      daysPracticed: ['2026-11-13'],
    });
    const savedProgress = saved(fake, documentNames.progress(FOX.id), progressDocument);
    expect(savedProgress.activities['typing-course']).toEqual({
      recentRounds: [],
      daysPracticed: ['2026-11-13'],
      furthestStep: 2,
    });
  });

  it('resets progress on screen to empty when the profile changes', async () => {
    const documents = savedApp([FOX, OWL], FOX.id);
    documents[documentNames.progress(FOX.id)] = json(
      progressDocument.schema.parse({
        version: 1,
        activities: { 'find-the-key': { recentRounds: [], daysPracticed: ['2026-11-01'] } },
      }),
    );
    const { store } = await startSession({ documents });
    expect(store.progressOf('find-the-key')?.daysPracticed).toEqual(['2026-11-01']);
    store.chooseProfile(OWL.id);
    await until(store, () => store.getSnapshot().status === 'ready');
    expect(store.progressOf('find-the-key')).toBeUndefined();
  });
});

describe('activity state', () => {
  const lessonState = activityStateDocument({
    schema: z.object({ furthestLesson: z.int().min(0) }),
    defaults: () => ({ furthestLesson: 0 }),
  });

  it('loads saved state, waits for it before an update, and saves the result', async () => {
    const documents = savedApp([FOX], FOX.id);
    const name = documentNames.activity(FOX.id, 'typing-course');
    documents[name] = json({ version: 1, state: { furthestLesson: 3 } });
    const { store, fake } = await startSession({ documents });

    store.openActivityState('typing-course', lessonState);
    expect(store.getSnapshot().activityStates['typing-course']).toMatchObject({
      loaded: false,
      state: { furthestLesson: 0 },
    });
    store.updateActivityState('typing-course', lessonState, (state) => ({ furthestLesson: state.furthestLesson + 1 }));
    await store.flush();
    await until(store, () => store.getSnapshot().activityStates['typing-course']?.loaded === true);

    expect(store.getSnapshot().activityStates['typing-course']).toMatchObject({
      loaded: true,
      state: { furthestLesson: 4 },
    });
    expect(savedJson(fake, name)).toEqual({ version: 1, state: { furthestLesson: 4 } });
  });

  it('replaces corrupt activity state with defaults', async () => {
    const documents = savedApp([FOX], FOX.id);
    const name = documentNames.activity(FOX.id, 'typing-course');
    documents[name] = json({ version: 1, state: { furthestLesson: -5 } });
    const { store, fake } = await startSession({ documents });
    store.openActivityState('typing-course', lessonState);
    await until(store, () => store.getSnapshot().activityStates['typing-course']?.loaded === true);
    expect(store.getSnapshot().activityStates['typing-course']?.state).toEqual({ furthestLesson: 0 });
    expect(fake.setAside).toEqual([name]);
  });

  it('refuses a second spec for the same activity', async () => {
    const { store } = await startSession({ documents: savedApp([FOX], FOX.id) });
    store.openActivityState('typing-course', lessonState);
    const other = activityStateDocument({ schema: z.object({}), defaults: () => ({}) });
    expect(() => store.openActivityState('typing-course', other)).toThrow(/two different specs/);
  });
});

describe('pictures', () => {
  it('saves, lists, trashes, and restores the active profile pictures', async () => {
    const { store } = await startSession({ documents: savedApp([FOX], FOX.id) });
    const pictures = store.pictures();
    const savedPicture = await pictures.save({ png: new Uint8Array([1]), thumbnail: new Uint8Array([2]) });
    if (!savedPicture.ok) throw savedPicture.error;
    const id = savedPicture.value.id;

    expect(await pictures.list('gallery')).toEqual({ ok: true, value: [savedPicture.value] });
    expect(await pictures.read(id, 'thumbnail')).toEqual({ ok: true, value: new Uint8Array([2]) });
    await pictures.trash(id);
    expect(await pictures.list('gallery')).toEqual({ ok: true, value: [] });
    expect(await pictures.restore(id)).toMatchObject({ ok: true, value: { id } });
  });

  it('turns a failed picture change into a result and a problem, never a rejection', async () => {
    const { store } = await startSession({ documents: savedApp([FOX], FOX.id) });
    const result = await store.pictures().purge('picture-404');
    expect(result).toMatchObject({ ok: false, error: { code: 'not-found' } });
    expect(store.getSnapshot().saveProblem).toMatchObject({
      target: `pictures/${FOX.id}`,
      operation: 'purge-picture',
      code: 'not-found',
    });
    expect(await store.pictures().read('picture-404', 'picture')).toMatchObject({
      ok: false,
      error: { code: 'not-found' },
    });
  });

  it('needs an active profile', async () => {
    const { store } = await startSession({ documents: savedApp([FOX], null) });
    expect(() => store.pictures()).toThrow(/needs an active profile/);
  });
});

describe('audio settings', () => {
  it('gives the engine the active profile volume and mute', async () => {
    const { audio } = await startSession({
      documents: savedApp([FOX], FOX.id, { voiceVolume: 0.4, effectsVolume: 0.2, muted: true }),
    });
    expect(audio.volume).toEqual({ voice: 0.4, effects: 0.2, muted: true });
  });

  it('saves a mute made on the engine, such as by the mute control', async () => {
    const { store, fake, audio } = await startSession({ documents: savedApp([FOX], FOX.id) });
    audio.setVolume({ muted: true });
    await store.flush();
    expect(store.getSnapshot().settings.muted).toBe(true);
    expect(saved(fake, documentNames.settings(FOX.id), settingsDocument).muted).toBe(true);
  });

  it('keeps a mute made with no profile, and replaces it with the profile setting once one is chosen', async () => {
    const { store, audio } = await startSession({ documents: savedApp([FOX], null, { voiceVolume: 0.7 }) });
    expect(audio.volume).toEqual({ voice: 1, effects: 0.6, muted: false });
    audio.setVolume({ muted: true });
    store.updateApp({ kioskLock: false });
    expect(audio.volume.muted).toBe(true);

    store.chooseProfile(FOX.id);
    await until(store, () => store.getSnapshot().status === 'ready');
    expect(audio.volume).toEqual({ voice: 0.7, effects: 0.6, muted: false });
  });
});

describe('session length', () => {
  it('is never reached with no limit, the default', async () => {
    const { store, clock } = await startSession({ documents: savedApp([FOX], FOX.id) });
    clock.mono += 10 * 60 * 60_000;
    expect(store.isSessionLimitReached()).toBe(false);
  });

  it('is reached at exactly the set length and not a millisecond before', async () => {
    const { store, clock } = await startSession({ documents: savedApp([FOX], FOX.id, { sessionLengthMinutes: 20 }) });
    clock.mono += 20 * 60_000 - 1;
    expect(store.isSessionLimitReached()).toBe(false);
    clock.mono += 1;
    expect(store.isSessionLimitReached()).toBe(true);
    expect(store.playedMs()).toBe(20 * 60_000);
  });

  it('counts from zero again when the profile changes', async () => {
    const { store, clock } = await startSession({
      documents: savedApp([FOX, OWL], FOX.id, { sessionLengthMinutes: 5 }),
    });
    clock.mono += 5 * 60_000;
    expect(store.isSessionLimitReached()).toBe(true);
    store.chooseProfile(OWL.id);
    await until(store, () => store.getSnapshot().status === 'ready');
    expect(store.playedMs()).toBe(0);
    expect(store.isSessionLimitReached()).toBe(false);
    store.chooseProfile(null);
    expect(store.isSessionLimitReached()).toBe(false);
  });

  it('moves the limit by the time a grown-up grants, until the profile changes', async () => {
    const { store, clock } = await startSession({
      documents: savedApp([FOX, OWL], FOX.id, { sessionLengthMinutes: 5 }),
    });
    clock.mono += 5 * 60_000;
    store.grantPlayTime(10 * 60_000);
    expect(store.isSessionLimitReached()).toBe(false);
    // Played time stays true to the clock; only the limit moves.
    expect(store.playedMs()).toBe(5 * 60_000);
    clock.mono += 10 * 60_000 - 1;
    expect(store.isSessionLimitReached()).toBe(false);
    clock.mono += 1;
    expect(store.isSessionLimitReached()).toBe(true);

    store.chooseProfile(OWL.id);
    await until(store, () => store.getSnapshot().status === 'ready');
    store.chooseProfile(FOX.id);
    await until(store, () => store.getSnapshot().status === 'ready');
    clock.mono += 5 * 60_000;
    expect(store.isSessionLimitReached()).toBe(true);
  });

  it('refuses a grant that is not a positive length of time', async () => {
    const { store } = await startSession({ documents: savedApp([FOX], FOX.id, { sessionLengthMinutes: 5 }) });
    for (const ms of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => store.grantPlayTime(ms)).toThrow('positive number');
    }
  });

  it('follows a limit the parent changes mid-session', async () => {
    const { store, clock } = await startSession({ documents: savedApp([FOX], FOX.id) });
    clock.mono += 6 * 60_000;
    store.updateSettings({ sessionLengthMinutes: 5 });
    expect(store.isSessionLimitReached()).toBe(true);
  });
});
