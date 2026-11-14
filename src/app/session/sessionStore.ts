import type { AudioEngine, VolumeSettings } from '../../audio/audioEngine.ts';
import { DEFAULT_BAND, type Band } from '../../core/bands.ts';
import {
  BridgeError,
  isBridgeError,
  type BridgeErrorCode,
  type PictureFile,
  type PictureSummary,
  type PlatformBridge,
  type SavePictureInput,
} from '../../core/platform/bridge.ts';
import { documentNames, type DocumentName, type PicturePlace } from '../../core/platform/names.ts';
import type { TestInfo } from '../../core/platform/testInfo.ts';
import { loadDocument, saveDocument, type DocumentSpec, type LoadResult } from '../../core/storage/document.ts';
import { newProfileId } from '../../core/storage/ids.ts';
import { recordRound, recordStep } from '../../core/storage/progress.ts';
import {
  appDocument,
  profilesDocument,
  progressDocument,
  settingsDocument,
  type ActivityProgress,
  type ActivityStateDocument,
  type AppDocument,
  type Profile,
  type ProgressDocument,
  type Settings,
} from '../../core/storage/schemas.ts';
import type { ThemeSettings } from '../theme/theme.ts';
import { createSerialQueues } from './serialQueues.ts';
import { isSessionLimitReached, type SessionClock } from './sessionLength.ts';

/**
 * The session: the saved documents of the app and of the active profile, held in memory and
 * written back through the bridge. Screens read it through the hooks in sessionHooks.ts.
 *
 * Every write to one document runs after the earlier ones, and a burst of updates coalesces into
 * the fewest writes that still end with the newest value. A read that started before an update
 * never replaces the updated value. A failed write becomes `saveProblem`, never a rejection.
 */

export type SessionStatus =
  /** The app or profiles document, or the active profile's settings or progress, is loading. */
  | 'loading'
  /** First launch is not done, or no profile exists. */
  | 'needs-first-launch'
  /** Profiles exist and none is active. */
  | 'needs-profile'
  /** A profile is active and its settings and progress are loaded. */
  | 'ready';

/** What a screen can show after a write or a picture change failed. */
export interface SaveProblem {
  /** The document name, or `pictures/<profile-id>` for a picture change. */
  readonly target: string;
  readonly operation: 'write' | 'remove-profile' | 'kiosk-lock' | PictureWrite;
  readonly code: BridgeErrorCode;
  readonly message: string;
}

/** A saved document that came back as defaults, so the parent corner can say so. */
export interface LoadProblem {
  readonly document: DocumentName;
  /** `reset`: bad data was set aside. `unreadable`: the platform could not read it. */
  readonly status: 'reset' | 'unreadable';
  readonly problem: string;
}

export interface ActivityStateEntry<S = unknown> {
  readonly loaded: boolean;
  /** The activity's own state, unwrapped from its versioned document. */
  readonly state: S;
  /** The spec the state was opened with. Only that spec can read it. */
  readonly spec: DocumentSpec<ActivityStateDocument<S>>;
}

/** Whether an entry was opened with this spec, so its state has the spec's type. */
export function isEntryOf<S>(
  entry: ActivityStateEntry,
  spec: DocumentSpec<ActivityStateDocument<S>>,
): entry is ActivityStateEntry<S> {
  return entry.spec === spec;
}

export interface SessionSnapshot {
  readonly status: SessionStatus;
  readonly app: AppDocument;
  readonly profiles: readonly Profile[];
  readonly activeProfile: Profile | null;
  /** The active profile's settings, or the defaults when no profile is active. */
  readonly settings: Settings;
  /** The active profile's progress, or empty progress when no profile is active. */
  readonly progress: ProgressDocument;
  /** The band, text size, letter spacing, and motion setting the app root applies. */
  readonly theme: ThemeSettings;
  /** Activity state documents of the active profile, by activity id. */
  readonly activityStates: Readonly<Record<string, ActivityStateEntry>>;
  /** Present only when the app runs under an end-to-end test. */
  readonly testInfo: TestInfo | null;
  /** The newest failed write. A later successful write of the same target clears it. */
  readonly saveProblem: SaveProblem | null;
  readonly loadProblems: readonly LoadProblem[];
}

/** A partial change to merge, or a function from the current value to the next. */
export type Update<T> = Partial<T> | ((current: T) => T);

export type NewProfile = Omit<Profile, 'id'>;

export type BridgeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: BridgeError };

type PictureWrite = 'save-picture' | 'copy-picture' | 'trash-picture' | 'restore-picture' | 'purge-picture';

/** The active profile's pictures. Every call resolves to a result and never rejects. */
export interface ProfilePictures {
  readonly profileId: string;
  readonly list: (place: PicturePlace) => Promise<BridgeResult<PictureSummary[]>>;
  readonly read: (id: string, file: PictureFile) => Promise<BridgeResult<Uint8Array>>;
  readonly save: (input: SavePictureInput) => Promise<BridgeResult<PictureSummary>>;
  readonly copy: (id: string) => Promise<BridgeResult<PictureSummary>>;
  readonly trash: (id: string) => Promise<BridgeResult<void>>;
  readonly restore: (id: string) => Promise<BridgeResult<PictureSummary>>;
  readonly purge: (id: string) => Promise<BridgeResult<void>>;
}

/** The part of the audio engine the session drives. */
type SessionAudio = Pick<AudioEngine, 'volume' | 'setVolume' | 'onVolumeChange'>;

export interface SessionStoreOptions {
  bridge: PlatformBridge;
  /** Gets the active profile's volume and mute, and saves changes made through it. */
  audio?: SessionAudio;
  clock?: SessionClock;
}

export interface SessionStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => SessionSnapshot;
  /** Loads the app and profiles documents and the last active profile. Call once. */
  readonly start: () => Promise<void>;
  /** Resolves when every write queued so far has settled. Call before quitting. */
  readonly flush: () => Promise<void>;

  readonly updateApp: (update: Update<AppDocument>) => void;
  /** Saves kiosk lock and turns it on or off for the window. */
  readonly setKioskLock: (on: boolean) => Promise<BridgeResult<void>>;

  /** Adds a profile and returns it. It does not become active. Throws past MAX_PROFILES or on a bad field. */
  readonly createProfile: (profile: NewProfile) => Profile;
  readonly updateProfile: (profileId: string, update: Update<NewProfile>) => void;
  /**
   * Removes a profile with its documents and pictures. When it is active, no profile is active
   * afterwards. On failure the profile stays in the list and `saveProblem` says why.
   */
  readonly deleteProfile: (profileId: string) => Promise<BridgeResult<void>>;
  /** Makes a profile active and loads its documents, or makes none active with null. Throws for a profile being deleted. */
  readonly chooseProfile: (profileId: string | null) => void;

  /** Throws when no profile is active, because there are no settings to save. */
  readonly updateSettings: (update: Update<Settings>) => void;

  readonly progressOf: (activityId: string) => ActivityProgress | undefined;
  /** Records a finished round. `difficulty` is the next level, from the activity kit. */
  readonly recordRound: (
    activityId: string,
    outcome: { mistakes: number; hintsUsed: number; level?: number },
    difficulty?: number,
  ) => void;
  /** Records that the child reached a step of a sequence activity. */
  readonly recordStep: (activityId: string, reachedStep: number) => void;

  /** Starts loading an activity's state for the active profile. Repeat calls reuse the first load. */
  readonly openActivityState: <S>(activityId: string, spec: DocumentSpec<ActivityStateDocument<S>>) => void;
  readonly updateActivityState: <S>(
    activityId: string,
    spec: DocumentSpec<ActivityStateDocument<S>>,
    update: (state: S) => S,
  ) => void;

  /** The active profile's pictures. Throws when no profile is active. */
  readonly pictures: () => ProfilePictures;

  /** Milliseconds of play since the active profile was chosen, on the monotonic clock. */
  readonly playedMs: () => number;
  /** Whether the parent's session length is used up. False when no limit is set or no profile is active. */
  readonly isSessionLimitReached: () => boolean;
  /**
   * Adds play time to the active profile's limit, for "a little more time" from the closing
   * screen. It lasts until the profile changes or the app restarts. Does nothing with no profile.
   */
  readonly grantPlayTime: (ms: number) => void;
}

const systemClock: SessionClock = {
  now: () => Date.now(),
  monotonic: () => performance.now(),
};

/** One saved document held in memory. */
class Cell<T> {
  value: T;
  loaded = false;
  writeQueued = false;
  readonly ready: Promise<void>;
  private markReady: () => void = () => {};

  readonly name: DocumentName;
  readonly spec: DocumentSpec<T>;

  constructor(name: DocumentName, spec: DocumentSpec<T>) {
    this.name = name;
    this.spec = spec;
    this.value = spec.defaults();
    this.ready = new Promise((resolve) => {
      this.markReady = resolve;
    });
  }

  finishLoad(): void {
    this.loaded = true;
    this.markReady();
  }
}

interface ActiveProfile {
  readonly profileId: string;
  readonly settings: Cell<Settings>;
  readonly progress: Cell<ProgressDocument>;
  readonly activityStates: Map<string, Cell<ActivityStateDocument<unknown>>>;
  readonly startedAt: number;
  /** Extra play time a grown-up gave from the closing screen, added to the limit. */
  grantedMs: number;
}

function isCellOf<S>(
  cell: Cell<ActivityStateDocument<unknown>>,
  spec: DocumentSpec<ActivityStateDocument<S>>,
): cell is Cell<ActivityStateDocument<S>> {
  return cell.spec === spec;
}

function toBridgeError(error: unknown): BridgeError {
  if (isBridgeError(error)) return error;
  return new BridgeError('io', error instanceof Error ? error.message : String(error));
}

function applyUpdate<T>(current: T, update: Update<T>): T {
  if (typeof update === 'function') return update(current);
  return { ...current, ...update };
}

function volumeOf(settings: Settings): VolumeSettings {
  return { voice: settings.voiceVolume, effects: settings.effectsVolume, muted: settings.muted };
}

function sameVolume(a: VolumeSettings, b: VolumeSettings): boolean {
  return a.voice === b.voice && a.effects === b.effects && a.muted === b.muted;
}

const DEFAULT_SETTINGS = settingsDocument.defaults();
const EMPTY_PROGRESS = progressDocument.defaults();

export function createSessionStore(options: SessionStoreOptions): SessionStore {
  const { bridge, audio } = options;
  const clock = options.clock ?? systemClock;
  const queues = createSerialQueues();
  const listeners = new Set<() => void>();
  const app = new Cell(documentNames.app, appDocument);
  const profiles = new Cell(documentNames.profiles, profilesDocument);
  /** Profiles whose files are being removed. Their pictures take no more changes. */
  const removed = new Set<string>();
  let active: ActiveProfile | null = null;
  let testInfo: TestInfo | null = null;
  let saveProblem: SaveProblem | null = null;
  let loadProblems: LoadProblem[] = [];
  let snapshot = buildSnapshot();
  let appliedVolume: VolumeSettings | null = null;

  function buildSnapshot(): SessionSnapshot {
    const activeProfile =
      active === null ? null : (profiles.value.profiles.find((p) => p.id === active?.profileId) ?? null);
    const settings = active?.settings.value ?? DEFAULT_SETTINGS;
    const band: Band = activeProfile?.band ?? DEFAULT_BAND;
    const activityStates: Record<string, ActivityStateEntry> = {};
    for (const [activityId, cell] of active?.activityStates ?? []) {
      activityStates[activityId] = { loaded: cell.loaded, state: cell.value.state, spec: cell.spec };
    }
    return {
      status: statusOf(),
      app: app.value,
      profiles: profiles.value.profiles,
      activeProfile,
      settings,
      progress: active?.progress.value ?? EMPTY_PROGRESS,
      theme: {
        band,
        textSize: settings.textSize,
        letterSpacing: settings.letterSpacing,
        reducedMotion: settings.reducedMotion,
      },
      activityStates,
      testInfo,
      saveProblem,
      loadProblems,
    };
  }

  function statusOf(): SessionStatus {
    if (!app.loaded || !profiles.loaded) return 'loading';
    if (!app.value.firstLaunchDone || profiles.value.profiles.length === 0) return 'needs-first-launch';
    if (active === null) return 'needs-profile';
    if (!active.settings.loaded || !active.progress.loaded) return 'loading';
    return 'ready';
  }

  function emit(): void {
    snapshot = buildSnapshot();
    syncAudio();
    for (const listener of listeners) listener();
  }

  // ---- audio ------------------------------------------------------------------------------

  /** Pushes the active profile's volume to the engine when it changes. */
  function syncAudio(): void {
    if (audio === undefined) return;
    const wanted = volumeOf(snapshot.settings);
    if (appliedVolume !== null && sameVolume(appliedVolume, wanted)) return;
    appliedVolume = wanted;
    if (!sameVolume(audio.volume, wanted)) audio.setVolume(wanted);
  }

  /** Saves a volume or mute change made on the engine, such as the mute control. */
  function onEngineVolume(volume: VolumeSettings): void {
    if (active === null || !active.settings.loaded) return;
    if (sameVolume(volume, volumeOf(active.settings.value))) return;
    appliedVolume = volume;
    updateSettings({ voiceVolume: volume.voice, effectsVolume: volume.effects, muted: volume.muted });
  }

  // ---- documents --------------------------------------------------------------------------

  /**
   * Reads a document into its cell. The read waits behind writes already queued for the same
   * name, so it sees them. Updates made before it finishes wait for it, so they apply to the
   * saved value instead of the defaults, and the read cannot replace them.
   */
  function load<T>(cell: Cell<T>): void {
    void readInto(cell);
  }

  async function readInto<T>(cell: Cell<T>): Promise<void> {
    let result: LoadResult<T>;
    try {
      result = await queues.run(cell.name, () => loadDocument(bridge.documents, cell.name, cell.spec));
    } catch (error) {
      // loadDocument never throws on bad data. This covers a bridge that broke its contract.
      result = { value: cell.spec.defaults(), status: 'unreadable', problem: toBridgeError(error).message };
    }
    if (result.status === 'reset' || result.status === 'unreadable') {
      loadProblems = [...loadProblems, { document: cell.name, status: result.status, problem: result.problem ?? '' }];
    }
    cell.value = result.value;
    cell.finishLoad();
    if (result.status === 'migrated') queueWrite(cell);
    emit();
  }

  function queueWrite<T>(cell: Cell<T>): void {
    if (cell.writeQueued) return;
    cell.writeQueued = true;
    void queues.run(cell.name, async () => {
      // Writes the newest value when the turn comes, so a burst of updates costs one write.
      cell.writeQueued = false;
      try {
        await saveDocument(bridge.documents, cell.name, cell.spec, cell.value);
        clearProblem(cell.name);
      } catch (error) {
        reportProblem(cell.name, 'write', error);
      }
    });
  }

  function change<T>(cell: Cell<T>, update: Update<T>): void {
    const commit = () => {
      // Parsing first throws on a bad value before anything changes, and applies the schema's trims.
      cell.value = cell.spec.schema.parse(applyUpdate(cell.value, update));
      queueWrite(cell);
      emit();
    };
    if (cell.loaded) {
      commit();
      return;
    }
    // An update before the load finishes applies to the loaded value, not to the defaults. A bad
    // value can no longer throw to the caller, so it is logged as the bug it is.
    void cell.ready.then(commit).catch((error: unknown) => console.error(error));
  }

  function reportProblem(target: string, operation: SaveProblem['operation'], error: unknown): BridgeError {
    const bridgeError = toBridgeError(error);
    saveProblem = { target, operation, code: bridgeError.code, message: bridgeError.message };
    emit();
    return bridgeError;
  }

  function clearProblem(target: string): void {
    if (saveProblem?.target !== target) return;
    saveProblem = null;
    emit();
  }

  // ---- profiles ---------------------------------------------------------------------------

  function activate(profileId: string | null): void {
    if (profileId === null) {
      active = null;
      return;
    }
    active = {
      profileId,
      settings: new Cell(documentNames.settings(profileId), settingsDocument),
      progress: new Cell(documentNames.progress(profileId), progressDocument),
      activityStates: new Map(),
      startedAt: clock.monotonic(),
      grantedMs: 0,
    };
    load(active.settings);
    load(active.progress);
  }

  function chooseProfile(profileId: string | null): void {
    if ((active?.profileId ?? null) === profileId) return;
    if (profileId !== null && !profiles.value.profiles.some((p) => p.id === profileId)) {
      throw new Error(`No profile with id ${profileId}.`);
    }
    if (profileId !== null && removed.has(profileId)) throw new Error(`Profile ${profileId} is being deleted.`);
    activate(profileId);
    change(app, { lastActiveProfileId: profileId });
    emit();
  }

  function requireActive(what: string): ActiveProfile {
    if (active === null) throw new Error(`${what} needs an active profile.`);
    return active;
  }

  function updateSettings(update: Update<Settings>): void {
    change(requireActive('updateSettings').settings, update);
  }

  async function deleteProfile(profileId: string): Promise<BridgeResult<void>> {
    if (active?.profileId === profileId) chooseProfile(null);
    removed.add(profileId);
    // Writes already queued for this profile finish first, so none lands after the removal.
    await queues.settled(`profile/${profileId}/`);
    await queues.settled(`pictures/${profileId}`);
    try {
      await bridge.documents.removeProfile(profileId);
    } catch (error) {
      removed.delete(profileId);
      return { ok: false, error: reportProblem(`profile/${profileId}`, 'remove-profile', error) };
    }
    change(profiles, (current) => ({ ...current, profiles: current.profiles.filter((p) => p.id !== profileId) }));
    if (app.value.lastActiveProfileId === profileId) change(app, { lastActiveProfileId: null });
    return { ok: true, value: undefined };
  }

  async function setKioskLock(on: boolean): Promise<BridgeResult<void>> {
    if (app.value.kioskLock !== on) change(app, { kioskLock: on });
    try {
      await bridge.window.setKioskLock(on);
      clearProblem('window');
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: reportProblem('window', 'kiosk-lock', error) };
    }
  }

  // ---- activity state ---------------------------------------------------------------------

  function activityCell<S>(activityId: string, spec: DocumentSpec<ActivityStateDocument<S>>) {
    const profile = requireActive('Activity state');
    const existing = profile.activityStates.get(activityId);
    if (existing !== undefined) {
      if (!isCellOf(existing, spec)) {
        throw new Error(`Activity ${activityId} opened its state with two different specs. Define the spec once.`);
      }
      return existing;
    }
    const cell = new Cell(documentNames.activity(profile.profileId, activityId), spec);
    profile.activityStates.set(activityId, cell);
    load(cell);
    return cell;
  }

  // ---- pictures ---------------------------------------------------------------------------

  function picturesFor(profileId: string): ProfilePictures {
    const key = `pictures/${profileId}`;

    async function read<T>(task: () => Promise<T>): Promise<BridgeResult<T>> {
      // Reads wait for earlier changes, so a list after a save shows the new picture.
      await queues.settled(key);
      try {
        return { ok: true, value: await task() };
      } catch (error) {
        return { ok: false, error: toBridgeError(error) };
      }
    }

    function write<T>(operation: PictureWrite, task: () => Promise<T>): Promise<BridgeResult<T>> {
      if (removed.has(profileId)) {
        const error = new BridgeError('not-found', 'The profile was removed.');
        return Promise.resolve({ ok: false, error: reportProblem(key, operation, error) });
      }
      return queues.run(key, async (): Promise<BridgeResult<T>> => {
        try {
          const value = await task();
          clearProblem(key);
          return { ok: true, value };
        } catch (error) {
          return { ok: false, error: reportProblem(key, operation, error) };
        }
      });
    }

    const store = bridge.pictures;
    return {
      profileId,
      list: (place) => read(() => store.list(profileId, place)),
      read: (id, file) => read(() => store.read(profileId, id, file)),
      save: (input) => write('save-picture', () => store.save(profileId, input)),
      copy: (id) => write('copy-picture', () => store.copy(profileId, id)),
      trash: (id) => write('trash-picture', () => store.trash(profileId, id)),
      restore: (id) => write('restore-picture', () => store.restore(profileId, id)),
      purge: (id) => write('purge-picture', () => store.purge(profileId, id)),
    };
  }

  // ---- the store --------------------------------------------------------------------------

  audio?.onVolumeChange(onEngineVolume);
  let started = false;

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,

    async start() {
      if (started) throw new Error('The session already started.');
      started = true;
      const info = bridge.info().then(
        (result) => result.test ?? null,
        () => null,
      );
      load(app);
      load(profiles);
      [testInfo] = await Promise.all([info, app.ready, profiles.ready]);
      const last = app.value.lastActiveProfileId;
      if (last !== null && profiles.value.profiles.some((p) => p.id === last)) activate(last);
      if (app.value.kioskLock) void setKioskLock(true);
      emit();
      await Promise.all([active?.settings.ready, active?.progress.ready]);
    },

    flush: () => queues.settled(),

    updateApp: (update) => change(app, update),

    setKioskLock,

    createProfile(profile) {
      const created: Profile = { ...profile, id: newProfileId() };
      change(profiles, (current) => ({ ...current, profiles: [...current.profiles, created] }));
      return created;
    },

    updateProfile(profileId, update) {
      change(profiles, (current) => {
        const index = current.profiles.findIndex((p) => p.id === profileId);
        const profile = current.profiles[index];
        if (profile === undefined) throw new Error(`No profile with id ${profileId}.`);
        const next = applyUpdate<NewProfile>(profile, update);
        const list = current.profiles.with(index, { ...next, id: profileId });
        return { ...current, profiles: list };
      });
    },

    deleteProfile,
    chooseProfile,
    updateSettings,

    progressOf: (activityId) => snapshot.progress.activities[activityId],

    recordRound(activityId, outcome, difficulty) {
      const finishedAt = new Date(clock.now());
      change(requireActive('recordRound').progress, (current) =>
        recordRound(current, activityId, outcome, finishedAt, difficulty),
      );
    },

    recordStep(activityId, reachedStep) {
      const finishedAt = new Date(clock.now());
      change(requireActive('recordStep').progress, (current) =>
        recordStep(current, activityId, reachedStep, finishedAt),
      );
    },

    openActivityState(activityId, spec) {
      const before = active?.activityStates.size;
      activityCell(activityId, spec);
      if (active?.activityStates.size !== before) emit();
    },

    updateActivityState(activityId, spec, update) {
      change(activityCell(activityId, spec), (current) => ({ ...current, state: update(current.state) }));
    },

    pictures: () => picturesFor(requireActive('pictures').profileId),

    playedMs: () => (active === null ? 0 : clock.monotonic() - active.startedAt),

    isSessionLimitReached() {
      if (active === null) return false;
      const played = clock.monotonic() - active.startedAt;
      return isSessionLimitReached(played - active.grantedMs, active.settings.value.sessionLengthMinutes);
    },

    grantPlayTime(ms) {
      if (!Number.isFinite(ms) || ms <= 0) throw new RangeError('Granted play time must be a positive number of ms.');
      if (active !== null) active.grantedMs += ms;
    },
  };
}
