import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAudioEngine, type AudioEngine } from '../../audio/audioEngine.ts';
import { CONTINUOUS } from '../../audio/sfx/continuous.ts';
import { ONE_SHOTS } from '../../audio/sfx/oneShots.ts';
import { BridgeError, type PlatformBridge, type SavePictureInput } from '../../core/platform/bridge.ts';
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
import { createManualScheduler } from '../../core/activityKit/scheduler.ts';
import { createSessionStore, SESSION_CALL_DEADLINE_MS, type SessionStore } from './sessionStore.ts';
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
  const documents = fake.bridge.documents;
  const read = documents.read.bind(documents);
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

/** Creates a profile and returns it, or fails the test with the reason it was not created. */
async function create(store: SessionStore, profile: Omit<Profile, 'id'>): Promise<Profile> {
  const result = await store.createProfile(profile);
  if (!result.ok) throw result.error;
  return result.value;
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
    const created = await create(store, { avatarId: 'bee', colorId: 'sun', band: 'band-3-5', name: ' Bo ' });
    expect(created.name).toBe('Bo');
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

  it('lists a new profile only once the list that names it is saved', async () => {
    const { store, fake } = await startSession({ documents: savedApp([FOX], null) });
    fake.holdWrites();
    const creating = store.createProfile({ avatarId: 'bee', colorId: 'sun', band: 'band-3-5' });
    await fake.heldWritesReach(1);
    expect(store.getSnapshot().profiles).toEqual([FOX]);
    const written = profilesDocument.schema.parse(JSON.parse(fake.heldWrites[0]?.text ?? '{}'));
    const id = written.profiles.at(-1)?.id ?? '';
    expect(() => store.chooseProfile(id)).toThrow(/No profile with id/);

    fake.resumeWrites();
    expect(await creating).toEqual({ ok: true, value: { id, avatarId: 'bee', colorId: 'sun', band: 'band-3-5' } });
    expect(store.getSnapshot().profiles.map((p) => p.id)).toEqual([FOX.id, id]);
  });

  it('does not add a profile whose list could not be saved, says why, and adds it when tried again', async () => {
    const { store, fake } = await startSession({ documents: savedApp([FOX], null) });
    fake.failNext('write', 'profiles', new BridgeError('io', 'disk full'));
    const failed = await store.createProfile({ avatarId: 'bee', colorId: 'sun', band: 'band-3-5' });
    expect(failed).toMatchObject({ ok: false, error: { code: 'io', message: 'disk full' } });
    expect(store.getSnapshot().profiles).toEqual([FOX]);
    expect(store.getSnapshot().saveProblem).toMatchObject({ target: 'profiles', operation: 'write', code: 'io' });
    expect(saved(fake, 'profiles', profilesDocument).profiles).toEqual([FOX]);

    const created = await create(store, { avatarId: 'bee', colorId: 'sun', band: 'band-3-5' });
    expect(saved(fake, 'profiles', profilesDocument).profiles).toEqual([FOX, created]);
    expect(store.getSnapshot().saveProblem).toBeNull();
  });

  it('refuses to create a profile while the profile list is not open', async () => {
    const fake = createFakeBridge({ documents: savedApp([FOX], null) });
    fake.failNext('read', 'profiles', new BridgeError('io', 'disk unplugged'));
    const store = createSessionStore({ bridge: fake.bridge });
    await store.start();
    expect(() => store.createProfile({ avatarId: 'bee', colorId: 'sun', band: 'band-3-5' })).toThrow(
      /needs the profile list open/,
    );
    expect(fake.calls.filter((call) => call.startsWith('documents.write'))).toEqual([]);
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
    // Nothing changes until the list without the profile is saved.
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', activeProfile: FOX });
    // The held settings write must finish before the removal, or it would bring the files back.
    await fake.heldWritesReach(2);
    await settle();
    expect(fake.calls).not.toContain(`documents.removeProfile ${FOX.id}`);
    fake.resumeWrites();
    await expect(deleting).resolves.toEqual({ ok: true, value: undefined });
    expect(store.getSnapshot()).toMatchObject({ status: 'needs-profile', activeProfile: null });

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

  it('refuses picture changes for a profile that was removed', async () => {
    const { store, fake } = await startSession({ documents: savedApp([FOX], FOX.id) });
    const pictures = store.pictures();
    await store.deleteProfile(FOX.id);
    const result = await pictures.save({ png: new Uint8Array([1]), thumbnail: new Uint8Array([2]) });
    expect(result).toMatchObject({ ok: false, error: { code: 'not-found' } });
    expect(fake.calls).not.toContain(`pictures.save ${FOX.id}`);
  });

  it('keeps a profile listed and active until the list without it is saved, then leaves it', async () => {
    const { store, fake } = await startSession({ documents: savedApp([FOX, OWL], FOX.id) });
    fake.holdWrites();
    const deleting = store.deleteProfile(FOX.id);
    await fake.heldWritesReach(1);
    expect(fake.heldWrites.map((write) => write.name)).toEqual(['profiles']);
    expect(store.getSnapshot()).toMatchObject({ profiles: [FOX, OWL], activeProfile: FOX });

    fake.resumeWrites();
    expect(await deleting).toEqual({ ok: true, value: undefined });
    expect(store.getSnapshot()).toMatchObject({ activeProfile: null, profiles: [OWL] });
    expect(() => store.chooseProfile(FOX.id)).toThrow(/No profile with id fox-kid/);
    await store.flush();
    expect(saved(fake, 'app', appDocument).lastActiveProfileId).toBeNull();
    expect([...fake.documents.keys()].filter((name) => name.startsWith(`profile/${FOX.id}/`))).toEqual([]);
  });

  it('keeps a profile whose list could not be saved exactly as it was, and says why', async () => {
    const { store, fake } = await startSession({ documents: savedApp([FOX, OWL], FOX.id) });
    fake.failNext('write', 'profiles', new BridgeError('io', 'disk full'));
    const result = await store.deleteProfile(FOX.id);
    expect(result).toMatchObject({ ok: false, error: { code: 'io', message: 'disk full' } });
    expect(store.getSnapshot().profiles).toEqual([FOX, OWL]);
    expect(store.getSnapshot().saveProblem).toEqual({
      target: `profile/${FOX.id}`,
      operation: 'remove-profile',
      code: 'io',
      message: 'disk full',
    });
    expect(fake.calls).not.toContain(`documents.removeProfile ${FOX.id}`);
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', activeProfile: FOX });
    await store.flush();
    expect(saved(fake, 'profiles', profilesDocument).profiles).toEqual([FOX, OWL]);
    expect(saved(fake, 'app', appDocument).lastActiveProfileId).toBe(FOX.id);
  });

  it('removes a profile even when its files could not be deleted', async () => {
    const { store, fake } = await startSession({ documents: savedApp([FOX, OWL], null) });
    fake.failNext('removeProfile', FOX.id, new BridgeError('io', 'disk busy'));
    expect(await store.deleteProfile(FOX.id)).toEqual({ ok: true, value: undefined });
    await store.flush();
    expect(store.getSnapshot()).toMatchObject({ profiles: [OWL], saveProblem: null });
    expect(saved(fake, 'profiles', profilesDocument).profiles).toEqual([OWL]);
    expect(fake.calls.filter((call) => call.startsWith('documents.removeProfile'))).toEqual([
      `documents.removeProfile ${FOX.id}`,
    ]);
  });

  it('refuses to remove a profile that is not listed, and deletes nothing', async () => {
    const { store, fake } = await startSession({ documents: savedApp([FOX], FOX.id) });
    expect(await store.deleteProfile('nobody')).toMatchObject({ ok: false, error: { code: 'not-found' } });
    await store.flush();
    expect(fake.calls.filter((call) => /^documents\.(write profiles|removeProfile)/.test(call))).toEqual([]);
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

    // Leave and come back while the write is still in flight. The file does not have 0.1 yet,
    // so the settings in memory stay the truth and nothing reads the file.
    const name = documentNames.settings(FOX.id);
    const readsBefore = fake.calls.filter((call) => call === `documents.read ${name}`).length;
    store.chooseProfile(OWL.id);
    store.chooseProfile(FOX.id);
    await settle();
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', settings: { voiceVolume: 0.1 } });
    fake.resumeWrites();
    await store.flush();

    expect(store.getSnapshot().settings.voiceVolume).toBe(0.1);
    expect(saved(fake, name, settingsDocument).voiceVolume).toBe(0.1);
    expect(fake.calls.filter((call) => call === `documents.read ${name}`)).toHaveLength(readsBefore);
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
      let activeId = random.pick(profiles).id;
      store.chooseProfile(activeId);
      for (let step = 0; step < 80; step++) {
        const roll = random.next();
        if (roll < 0.25) {
          activeId = random.pick(profiles).id;
          store.chooseProfile(activeId);
        } else if (roll < 0.6) {
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
      expect(store.getSnapshot().settings, `seed ${seed}, in memory`).toMatchObject(expected.get(activeId) ?? {});
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

/** A bridge method whose calls never answer until the test answers them. */
function hangCalls<T>(): {
  readonly call: (...args: unknown[]) => Promise<T>;
  readonly answerAll: (value: T) => void;
  readonly failAll: (error: Error) => void;
  readonly count: () => number;
} {
  const pending: Array<{ resolve: (value: T) => void; reject: (error: Error) => void }> = [];
  return {
    call: () => new Promise<T>((resolve, reject) => pending.push({ resolve, reject })),
    answerAll: (value) => {
      for (const entry of pending.splice(0)) entry.resolve(value);
    },
    failAll: (error) => {
      for (const entry of pending.splice(0)) entry.reject(error);
    },
    count: () => pending.length,
  };
}

const never = (): Promise<never> => new Promise<never>(() => undefined);

/** A store on a manual deadline clock, not yet started. */
function storeWithDeadlines(options: FakeBridgeOptions = {}) {
  const fake = createFakeBridge(options);
  const timers = createManualScheduler({ wall: 0 });
  const store = createSessionStore({ bridge: fake.bridge, clock: createClock().sessionClock, timers });
  return { fake, timers, store };
}

/** Whether the promise has settled after every pending promise ran. */
async function hasSettled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  void promise.then(
    () => (done = true),
    () => (done = true),
  );
  await settle();
  return done;
}

describe('bridge calls that never answer', () => {
  it('ends a profile read at the deadline as unreadable, without setting the file aside or making the profile active', async () => {
    const { fake, timers, store } = storeWithDeadlines({ documents: savedApp([FOX], FOX.id, { voiceVolume: 0.2 }) });
    const settingsName = documentNames.settings(FOX.id);
    const read = fake.bridge.documents.read.bind(fake.bridge.documents);
    const hung = hangCalls<string | null>();
    fake.bridge.documents.read = (name) => (name === settingsName ? hung.call(name) : read(name));
    const started = store.start();
    await settle();
    expect(hung.count()).toBe(1);
    timers.advance(SESSION_CALL_DEADLINE_MS - 1);
    expect(await hasSettled(started)).toBe(false);
    timers.advance(1);
    await started;
    expect(store.getSnapshot()).toMatchObject({
      status: 'needs-profile',
      activeProfile: null,
      profileNotOpened: FOX.id,
      loadProblems: [],
    });
    expect(fake.calls).not.toContain(`documents.setAside ${settingsName}`);

    // The late answer is dropped: only choosing the profile again reads the file, and then it opens.
    hung.answerAll(json({ ...settingsDocument.defaults(), muted: true }));
    await settle();
    expect(store.getSnapshot()).toMatchObject({ status: 'needs-profile', profileNotOpened: FOX.id });
    fake.bridge.documents.read = read;
    store.chooseProfile(FOX.id);
    await until(store, () => store.getSnapshot().status === 'ready');
    expect(store.getSnapshot()).toMatchObject({
      activeProfile: FOX,
      profileNotOpened: null,
      settings: { voiceVolume: 0.2 },
    });
    expect(fake.calls.filter((call) => call.startsWith('documents.write profile/'))).toEqual([]);
  });

  it('turns a write that passes its deadline into a save problem, and holds the next write of that document until it ends', async () => {
    const { fake, timers, store } = storeWithDeadlines({ documents: savedApp([FOX], FOX.id) });
    await store.start();
    const name = documentNames.settings(FOX.id);
    const write = fake.bridge.documents.write.bind(fake.bridge.documents);
    const hung = hangCalls<void>();
    fake.bridge.documents.write = hung.call;
    store.updateSettings({ muted: true });
    await settle();
    timers.advance(SESSION_CALL_DEADLINE_MS);
    await settle();
    expect(store.getSnapshot().saveProblem).toMatchObject({
      target: name,
      operation: 'write',
      code: 'io',
      message: expect.stringMatching(/did not finish within/),
    });

    // The next write waits: sent now, it could land before the late one, which would then put
    // the older value back on disk.
    fake.bridge.documents.write = write;
    store.updateSettings({ voiceVolume: 0.5 });
    const flushed = store.flush();
    expect(await hasSettled(flushed)).toBe(false);
    expect(fake.calls).not.toContain(`documents.write ${name}`);
    expect(store.hasPendingWork()).toBe(true);

    hung.failAll(new BridgeError('io', 'disk full'));
    await flushed;
    expect(saved(fake, name, settingsDocument)).toMatchObject({ muted: true, voiceVolume: 0.5 });
    expect(store.getSnapshot().saveProblem).toBeNull();
  });

  it('removes a profile while its write past the deadline is held, and deletes its files only after that write ends', async () => {
    const { fake, timers, store } = storeWithDeadlines({ documents: savedApp([FOX, OWL], FOX.id) });
    await store.start();
    const write = fake.bridge.documents.write.bind(fake.bridge.documents);
    const hung = hangCalls<void>();
    fake.bridge.documents.write = (name, text) =>
      name === documentNames.settings(FOX.id) ? hung.call() : write(name, text);
    store.updateSettings({ muted: true });
    await settle();
    timers.advance(SESSION_CALL_DEADLINE_MS);
    await settle();

    expect(await store.deleteProfile(FOX.id)).toEqual({ ok: true, value: undefined });
    expect(store.getSnapshot().profiles.map((p) => p.id)).toEqual([OWL.id]);
    await settle();
    // Deleting now would let the late write put the settings file back.
    expect(fake.calls).not.toContain(`documents.removeProfile ${FOX.id}`);

    hung.answerAll(undefined);
    await store.flush();
    expect(fake.calls).toContain(`documents.removeProfile ${FOX.id}`);
  });

  it.each([
    [
      'lands',
      (hung: ReturnType<typeof hangCalls<void>>) => hung.answerAll(undefined),
      { ok: true, value: undefined },
      { profiles: [OWL], activeProfile: null },
      [`documents.removeProfile ${FOX.id}`],
    ],
    [
      'fails',
      (hung: ReturnType<typeof hangCalls<void>>) => hung.failAll(new BridgeError('io', 'disk full')),
      { ok: false, error: { code: 'io', message: 'disk full' } },
      { profiles: [FOX, OWL], activeProfile: FOX },
      [],
    ],
  ] as const)(
    'waits past the deadline for a removal whose list write %s, and reports what really happened',
    async (_name, end, outcome, after, deletions) => {
      const { fake, timers, store } = storeWithDeadlines({ documents: savedApp([FOX, OWL], FOX.id) });
      await store.start();
      const write = fake.bridge.documents.write.bind(fake.bridge.documents);
      const hung = hangCalls<void>();
      fake.bridge.documents.write = (name, text) => (name === 'profiles' ? hung.call() : write(name, text));
      const removal = store.deleteProfile(FOX.id);
      await settle();
      timers.advance(SESSION_CALL_DEADLINE_MS * 10);
      expect(await hasSettled(removal)).toBe(false);
      expect(store.getSnapshot()).toMatchObject({ profiles: [FOX, OWL], activeProfile: FOX, saveProblem: null });

      end(hung);
      expect(await removal).toMatchObject(outcome);
      expect(store.getSnapshot()).toMatchObject(after);
      await store.flush();
      expect(fake.calls.filter((call) => call.startsWith('documents.removeProfile'))).toEqual(deletions);
    },
  );

  it.each([
    ['lands', (hung: ReturnType<typeof hangCalls<void>>) => hung.answerAll(undefined), null],
    [
      'fails',
      (hung: ReturnType<typeof hangCalls<void>>) => hung.failAll(new BridgeError('io', 'disk full')),
      { code: 'io', message: 'disk full' },
    ],
  ] as const)('reports how a write past its deadline really ended when it %s', async (_name, end, problem) => {
    const { fake, timers, store } = storeWithDeadlines({ documents: savedApp([FOX], FOX.id) });
    await store.start();
    const hung = hangCalls<void>();
    fake.bridge.documents.write = hung.call;
    store.updateSettings({ muted: true });
    await settle();
    timers.advance(SESSION_CALL_DEADLINE_MS);
    await settle();
    expect(store.getSnapshot().saveProblem).toMatchObject({ message: expect.stringMatching(/did not finish within/) });
    end(hung);
    await store.flush();
    const target = documentNames.settings(FOX.id);
    expect(store.getSnapshot().saveProblem).toEqual(problem && { target, operation: 'write', ...problem });
  });

  it.each([
    [
      'a picture save',
      (store: SessionStore) => store.pictures().save({ png: new Uint8Array(), thumbnail: new Uint8Array() }),
    ],
    ['a picture list', (store: SessionStore) => store.pictures().list('gallery')],
    ['a kiosk lock change', (store: SessionStore) => store.setKioskLock(true)],
  ] as const)('ends %s that never answers as an io failure, so the queue moves on', async (_name, act) => {
    const { fake, timers, store } = storeWithDeadlines({ documents: savedApp([FOX], FOX.id) });
    await store.start();
    fake.bridge.pictures.save = never;
    fake.bridge.pictures.list = never;
    fake.bridge.documents.removeProfile = never;
    fake.bridge.window.setKioskLock = never;
    const result = act(store);
    await settle();
    timers.advance(SESSION_CALL_DEADLINE_MS - 1);
    expect(await hasSettled(result)).toBe(false);
    timers.advance(1);
    expect(await result).toMatchObject({
      ok: false,
      error: { code: 'io', message: expect.stringMatching(/did not finish within/) },
    });
    // Nothing is left holding a queue, so quitting can flush.
    expect(await hasSettled(store.flush())).toBe(true);
  });
});

describe('saved things that cannot be opened at start', () => {
  it('shows that the saved things could not be opened when the profiles read never answers, and opens them on retry', async () => {
    const { fake, timers, store } = storeWithDeadlines({ documents: savedApp([FOX, OWL], null) });
    const read = fake.bridge.documents.read.bind(fake.bridge.documents);
    const hung = hangCalls<string | null>();
    fake.bridge.documents.read = (name) => (name === 'profiles' ? hung.call(name) : read(name));
    const started = store.start();
    await settle();
    timers.advance(SESSION_CALL_DEADLINE_MS);
    await started;
    expect(store.getSnapshot()).toMatchObject({ status: 'unavailable', profiles: [] });

    // The late answer of the first read is dropped; only a retry opens the saved things.
    hung.answerAll(json({ version: 1, profiles: [FOX] }));
    await settle();
    expect(store.getSnapshot().status).toBe('unavailable');

    fake.bridge.documents.read = read;
    await store.retryStart();
    expect(store.getSnapshot()).toMatchObject({ status: 'needs-profile', profiles: [FOX, OWL] });
    // Nothing was written while the saved things were unknown, so no profile was overwritten.
    expect(fake.calls.filter((call) => call.startsWith('documents.write'))).toEqual([]);
    // Only the document that failed is read again.
    expect(fake.calls.filter((call) => call === 'documents.read app')).toHaveLength(1);
  });

  it.each(['app', 'profiles'] as const)(
    'never falls through to first launch when the %s document is unreadable',
    async (name) => {
      const { fake, store } = storeWithDeadlines({ documents: savedApp([FOX], FOX.id) });
      fake.failNext('read', name, new BridgeError('io', 'disk unplugged'));
      await store.start();
      expect(store.getSnapshot().status).toBe('unavailable');
      expect(store.getSnapshot().activeProfile).toBeNull();
      await store.retryStart();
      expect(store.getSnapshot()).toMatchObject({ status: 'ready', activeProfile: FOX });
    },
  );

  it('applies an update made while the saved things were unavailable to the opened value', async () => {
    const { fake, store } = storeWithDeadlines({ documents: savedApp([FOX], FOX.id) });
    fake.failNext('read', 'app', new BridgeError('io', 'disk unplugged'));
    await store.start();
    store.updateApp({ kioskLock: false });
    await store.retryStart();
    await store.flush();
    expect(saved(fake, 'app', appDocument)).toMatchObject({ firstLaunchDone: true, lastActiveProfileId: FOX.id });
  });
});

describe('documents that could not be read', () => {
  const lessonState = activityStateDocument({
    schema: z.object({ furthestLesson: z.int().min(0) }),
    defaults: () => ({ furthestLesson: 0 }),
  });

  it('shows activity state that could not be read as not opened, drops updates to it, and reads it again on reopen', async () => {
    const documents = savedApp([FOX], FOX.id);
    const name = documentNames.activity(FOX.id, 'typing-course');
    documents[name] = json({ version: 1, state: { furthestLesson: 3 } });
    const { fake, store } = storeWithDeadlines({ documents });
    await store.start();
    fake.failNext('read', name, new BridgeError('io', 'disk busy'));

    store.openActivityState('typing-course', lessonState);
    // Made while the read runs, so it waits for it, and is dropped when the read fails.
    store.updateActivityState('typing-course', lessonState, (state) => ({ furthestLesson: state.furthestLesson + 1 }));
    await until(store, () => store.getSnapshot().activityStates['typing-course']?.unreadable === true);
    store.updateActivityState('typing-course', lessonState, () => ({ furthestLesson: 0 }));
    await store.flush();
    expect(store.getSnapshot().activityStates['typing-course']).toMatchObject({ loaded: false, unreadable: true });
    expect(fake.calls).not.toContain(`documents.write ${name}`);
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', activeProfile: FOX });

    store.openActivityState('typing-course', lessonState);
    await until(store, () => store.getSnapshot().activityStates['typing-course']?.loaded === true);
    expect(store.getSnapshot().activityStates['typing-course']).toMatchObject({
      unreadable: false,
      state: { furthestLesson: 3 },
    });
  });

  it.each([
    ['settings', (id: string) => documentNames.settings(id)],
    ['progress', (id: string) => documentNames.progress(id)],
  ] as const)('does not make a profile active when its %s cannot be read', async (_label, nameOf) => {
    const { fake, store } = storeWithDeadlines({ documents: savedApp([FOX, OWL], OWL.id) });
    await store.start();
    fake.failNext('read', nameOf(FOX.id), new BridgeError('io', 'disk busy'));
    store.chooseProfile(FOX.id);
    store.updateSettings({ muted: true });
    await until(store, () => store.getSnapshot().status !== 'loading');
    await store.flush();
    expect(store.getSnapshot()).toMatchObject({
      status: 'needs-profile',
      activeProfile: null,
      profileNotOpened: FOX.id,
    });
    expect(fake.calls).not.toContain(`documents.write ${nameOf(FOX.id)}`);

    // The rest of the family is not blocked, and choosing the profile again reads it again.
    store.chooseProfile(OWL.id);
    await until(store, () => store.getSnapshot().status === 'ready');
    expect(store.getSnapshot()).toMatchObject({ activeProfile: OWL, profileNotOpened: null });
    store.chooseProfile(FOX.id);
    await until(store, () => store.getSnapshot().status === 'ready');
    expect(store.getSnapshot().activeProfile).toEqual(FOX);
  });

  it('forgets the profile that could not be opened once it is deleted', async () => {
    const { fake, store } = storeWithDeadlines({ documents: savedApp([FOX, OWL], FOX.id) });
    fake.failNext('read', documentNames.settings(FOX.id), new BridgeError('io', 'disk busy'));
    await store.start();
    expect(store.getSnapshot()).toMatchObject({ status: 'needs-profile', profileNotOpened: FOX.id });
    expect(await store.deleteProfile(FOX.id)).toEqual({ ok: true, value: undefined });
    expect(store.getSnapshot()).toMatchObject({ status: 'needs-profile', profileNotOpened: null, profiles: [OWL] });
    await store.flush();
    expect(saved(fake, 'app', appDocument).lastActiveProfileId).toBeNull();
  });

  it('never writes a document without a successful read of it, through random reads that fail, pass their deadline, or answer late', async () => {
    const profiles = [FOX, OWL];
    for (let seed = 1; seed <= 30; seed++) {
      const random = createRandom(seed);
      const documents = savedApp(profiles, FOX.id, { sessionLengthMinutes: 15 });
      for (const profile of profiles) {
        documents[documentNames.progress(profile.id)] = json({
          version: 1,
          activities: { old: { recentRounds: [], daysPracticed: [], furthestStep: 7 } },
        });
        documents[documentNames.activity(profile.id, 'typing-course')] = json({
          version: 1,
          state: { furthestLesson: 3 },
        });
      }
      const { fake, timers, store } = storeWithDeadlines({ documents });
      const read = fake.bridge.documents.read.bind(fake.bridge.documents);
      const write = fake.bridge.documents.write.bind(fake.bridge.documents);
      /** How the store last saw a read of each document end: answered in time, or not. */
      const lastRead = new Map<string, 'ok' | 'failed'>();
      const unread: string[] = [];
      const held: Array<{ name: DocumentName; expired: boolean; answer: () => void }> = [];
      let chaos = true;

      fake.bridge.documents.read = (name) => {
        const roll = chaos ? random.next() : 1;
        if (roll < 0.15) {
          lastRead.set(name, 'failed');
          return Promise.reject(new BridgeError('io', 'disk busy'));
        }
        const answered = (text: string | null) => {
          lastRead.set(name, 'ok');
          return text;
        };
        if (roll < 0.4) {
          return new Promise((resolve) => {
            const entry = {
              name,
              expired: false,
              // An answer after the deadline is dropped, so it never counts as a read.
              answer: () => void read(name).then((text) => resolve(entry.expired ? text : answered(text))),
            };
            held.push(entry);
          });
        }
        return read(name).then(answered);
      };
      fake.bridge.documents.write = (name, text) => {
        if (lastRead.get(name) !== 'ok') unread.push(name);
        return write(name, text);
      };
      const expire = () => {
        for (const entry of held) {
          if (entry.expired) continue;
          entry.expired = true;
          lastRead.set(entry.name, 'failed');
        }
        timers.advance(SESSION_CALL_DEADLINE_MS);
      };

      void store.start();
      for (let step = 0; step < 80; step++) {
        const roll = random.next();
        const hasProfile = store.getSnapshot().activeProfile !== null;
        if (roll < 0.15 && store.getSnapshot().profiles.length > 0) {
          store.chooseProfile(random.pick(profiles).id);
        } else if (roll < 0.35 && hasProfile) {
          store.updateSettings({ voiceVolume: random.int(0, 10) / 10 });
        } else if (roll < 0.45 && hasProfile) {
          store.recordStep('new', random.int(1, 5));
        } else if (roll < 0.55 && hasProfile) {
          store.openActivityState('typing-course', lessonState);
          store.updateActivityState('typing-course', lessonState, (s) => ({ furthestLesson: s.furthestLesson + 1 }));
        } else if (roll < 0.7) {
          expire();
        } else if (roll < 0.85) {
          held.splice(random.int(0, Math.max(held.length - 1, 0)), 1)[0]?.answer();
        } else if (store.getSnapshot().status === 'unavailable') {
          void store.retryStart();
        }
        if (random.next() < 0.5) await settle();
      }

      // Everything answers now, and every profile opens.
      chaos = false;
      expire();
      for (const entry of held.splice(0)) entry.answer();
      await settle();
      for (const profile of profiles) {
        for (
          let tries = 0;
          store.getSnapshot().status !== 'ready' || store.getSnapshot().activeProfile?.id !== profile.id;
          tries++
        ) {
          if (tries > 20) throw new Error(`seed ${seed}: ${profile.id} is still ${store.getSnapshot().status}`);
          if (store.getSnapshot().status === 'unavailable') await store.retryStart();
          else if (store.getSnapshot().profiles.length > 0 && store.getSnapshot().activeProfile?.id !== profile.id) {
            store.chooseProfile(profile.id);
          }
          await settle();
        }
      }
      await store.flush();

      expect(unread, `seed ${seed}: writes without a read`).toEqual([]);
      for (const profile of profiles) {
        const settings = saved(fake, documentNames.settings(profile.id), settingsDocument);
        expect(settings.sessionLengthMinutes, `seed ${seed}, ${profile.id} settings`).toBe(15);
        const progress = saved(fake, documentNames.progress(profile.id), progressDocument);
        expect(progress.activities.old?.furthestStep, `seed ${seed}, ${profile.id} progress`).toBe(7);
        const lesson = savedJson(fake, documentNames.activity(profile.id, 'typing-course'));
        expect(lesson, `seed ${seed}, ${profile.id} activity`).toMatchObject({
          state: { furthestLesson: expect.any(Number) },
        });
        expect(lessonState.schema.parse(lesson).state.furthestLesson).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('creating and removing profiles while the platform is slow', () => {
  it("never deletes a listed profile's files or reports an outcome the disk contradicts, through random creations, removals, failed and slow list writes, and restarts", async () => {
    const png = new Uint8Array([1]);
    for (let seed = 1; seed <= 40; seed++) {
      const random = createRandom(seed);
      const fake = createFakeBridge({ documents: savedApp([FOX, OWL], FOX.id) });
      const at = (step: number) => `seed ${seed}, step ${step}`;
      let step = 0;
      const listedOnDisk = () => saved(fake, 'profiles', profilesDocument).profiles.map((p) => p.id);

      // The storage itself. Every deletion is checked at the moment it happens, and every file that
      // reaches it is remembered, so each listed profile can be checked for all of its files at the end.
      const { documents: disk, pictures: gallery } = fake.bridge;
      const deletedListed: string[] = [];
      const unlistedCreations: string[] = [];
      const storedSettings = new Set<string>();
      const storedPictures = new Map<string, string[]>();
      const diskWrite = disk.write.bind(disk);
      const diskRemove = disk.removeProfile.bind(disk);
      const diskSave = gallery.save.bind(gallery);
      const storage = {
        write: async (name: DocumentName, text: string) => {
          await diskWrite(name, text);
          const [head, id, kind] = name.split('/');
          if (head === 'profile' && kind === 'settings' && id !== undefined) storedSettings.add(id);
        },
        removeProfile: (profileId: string) => {
          if (listedOnDisk().includes(profileId)) deletedListed.push(`${at(step)}: ${profileId}`);
          return diskRemove(profileId);
        },
        save: async (profileId: string, input: SavePictureInput) => {
          const summary = await diskSave(profileId, input);
          storedPictures.set(profileId, [...(storedPictures.get(profileId) ?? []), summary.id]);
          return summary;
        },
      };
      for (const profile of [FOX, OWL]) {
        await storage.save(profile.id, { id: `${profile.id}-art`, png, thumbnail: png });
      }

      // Each run of the app gets a bridge of its own. A call that changes what is listed or stored
      // answers late, early, or fails, as the test decides. A run that stopped gets no more answers.
      let run = 0;
      let chaos = true;
      const parked: Array<{ run: number; land: () => void }> = [];
      function bridgeFor(own: number): PlatformBridge {
        function slow<A extends unknown[], T>(
          call: (...args: A) => Promise<T>,
          canFail: (...args: A) => boolean = () => true,
        ): (...args: A) => Promise<T> {
          return (...args) => {
            if (own !== run) return never();
            const roll = chaos ? random.next() : 1;
            if (roll < 0.15 && canFail(...args)) return Promise.reject(new BridgeError('io', 'disk busy'));
            if (roll < 0.55) {
              return new Promise<T>((resolve, reject) =>
                parked.push({ run: own, land: () => void call(...args).then(resolve, reject) }),
              );
            }
            return call(...args);
          };
        }
        return {
          ...fake.bridge,
          documents: {
            ...disk,
            write: slow(storage.write, (name) => name === 'profiles'),
            removeProfile: slow(storage.removeProfile),
          },
          pictures: { ...gallery, save: slow(storage.save) },
        };
      }

      /** What the app last told the adult about a profile, while that run was still going. */
      const told = new Map<string, 'created' | 'not-removed' | 'removed'>();
      const checkTold = (listed: readonly string[]) => {
        for (const [id, outcome] of told) {
          expect(listed.includes(id), `${at(step)}: ${id} was ${outcome}`).toBe(outcome !== 'removed');
        }
      };

      let timers = createManualScheduler({ wall: 0 });
      let store = createSessionStore({ bridge: bridgeFor(run), clock: createClock().sessionClock, timers });
      await store.start();

      /** The app stops, the platform finishes or drops what it was doing, and the app starts again. */
      const restart = async () => {
        const stopped = run;
        run += 1;
        for (const entry of parked.filter((e) => e.run === stopped)) {
          parked.splice(parked.indexOf(entry), 1);
          if (random.next() < 0.5) entry.land();
        }
        await settle();
        timers = createManualScheduler({ wall: 0 });
        store = createSessionStore({ bridge: bridgeFor(run), clock: createClock().sessionClock, timers });
        await store.start();
        checkTold(store.getSnapshot().profiles.map((p) => p.id));
      };

      for (step = 0; step < 100; step++) {
        const roll = random.next();
        const own = run;
        const current = store;
        const { profiles, status, activeProfile } = current.getSnapshot();
        if (roll < 0.1 && profiles.length < 6) {
          void (async () => {
            const result = await current.createProfile({ avatarId: 'cat', colorId: 'sun', band: 'band-3-5' });
            if (own !== run || !result.ok) return;
            told.set(result.value.id, 'created');
            if (!listedOnDisk().includes(result.value.id)) unlistedCreations.push(`${at(step)}: ${result.value.id}`);
          })();
        } else if (roll < 0.2 && profiles.length > 0) {
          current.chooseProfile(random.pick(profiles).id);
        } else if (roll < 0.25 && profiles.length > 0) {
          current.updateProfile(random.pick(profiles).id, { name: `Kid ${String(step)}` });
        } else if (roll < 0.33 && status === 'ready' && activeProfile !== null) {
          current.updateSettings({ voiceVolume: random.int(0, 10) / 10 });
        } else if (roll < 0.41 && status === 'ready') {
          void current.pictures().save({ id: `picture-${String(step)}`, png, thumbnail: png });
        } else if (roll < 0.55 && profiles.length > 0) {
          const id = random.pick(profiles).id;
          // Until this removal answers, nobody knows whether the profile stays.
          told.delete(id);
          void (async () => {
            const result = await current.deleteProfile(id);
            if (own !== run) return;
            if (result.ok) told.set(id, 'removed');
            else if (result.error.code === 'io') told.set(id, 'not-removed');
          })();
        } else if (roll < 0.65) {
          timers.advance(SESSION_CALL_DEADLINE_MS);
        } else if (roll < 0.95) {
          const index = random.int(0, Math.max(parked.length - 1, 0));
          const entry = parked[index];
          if (entry !== undefined && entry.run === run) parked.splice(index, 1)[0]?.land();
        } else {
          await restart();
        }
        if (random.next() < 0.5) await settle();
      }

      // Everything answers, and the app starts again over the same storage.
      chaos = false;
      while (parked.some((e) => e.run === run) || store.hasPendingWork()) {
        for (const entry of parked.filter((e) => e.run === run)) {
          parked.splice(parked.indexOf(entry), 1);
          entry.land();
        }
        timers.advance(SESSION_CALL_DEADLINE_MS);
        await settle();
      }
      await restart();
      await store.flush();

      expect(deletedListed, `seed ${seed}: deletions of listed profiles`).toEqual([]);
      expect(unlistedCreations, `seed ${seed}: created but not listed`).toEqual([]);
      const listed = listedOnDisk();
      expect(store.getSnapshot().profiles.map((p) => p.id)).toEqual(listed);
      for (const id of listed) {
        expect(fake.pictureIds(id, 'gallery'), `seed ${seed}: pictures of ${id}`).toEqual(
          expect.arrayContaining(storedPictures.get(id) ?? []),
        );
        expect(fake.documents.has(documentNames.settings(id)), `seed ${seed}: settings of ${id}`).toBe(
          storedSettings.has(id) || [FOX.id, OWL.id].includes(id),
        );
      }
    }
  });
});
