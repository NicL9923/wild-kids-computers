import type { AudioEngine, VolumeSettings } from '../../audio/audioEngine.ts';
import { withDeadline } from '../../core/activityKit/deadline.ts';
import { systemScheduler, type Scheduler } from '../../core/activityKit/scheduler.ts';
import { DEFAULT_BAND, type Band } from '../../core/bands.ts';
import {
  BridgeError,
  isBridgeError,
  type BridgeErrorCode,
  type DocumentStore,
  type PictureFile,
  type PictureStore,
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
 *
 * Every bridge call has a deadline, so one call that never answers cannot hold its caller, or the
 * start of the app. A deadline changes what the child and the adult are told, never the order of
 * operations: a document write past its deadline shows as a save problem, but its document's
 * queue waits until the write really ends, and the document in memory stays the truth until then.
 */

export type SessionStatus =
  /** The app or profiles document, or the active profile's settings or progress, is loading. */
  | 'loading'
  /**
   * The app or profiles document could not be read, so the app cannot know which children it has,
   * or the chosen profile's settings or progress could not be read, so that profile is not active.
   * Nothing is replaced with defaults and nothing is written until `retryStart()` reads them.
   */
  | 'unavailable'
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

/** A saved document whose bad data was set aside and replaced with defaults, so the parent corner can say so. */
export interface LoadProblem {
  readonly document: DocumentName;
  readonly status: 'reset';
  readonly problem: string;
}

export interface ActivityStateEntry<S = unknown> {
  readonly loaded: boolean;
  /**
   * The saved state could not be read. Nothing is written and updates are dropped until
   * `openActivityState` reads it again.
   */
  readonly unreadable: boolean;
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
  /** The timers of the bridge call deadline. Real time by default; a test steps a manual scheduler. */
  timers?: Pick<Scheduler, 'setTimeout'>;
}

export interface SessionStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => SessionSnapshot;
  /** Loads the app and profiles documents and the last active profile. Call once. */
  readonly start: () => Promise<void>;
  /**
   * With status `unavailable`, reads the app and profiles documents that could not be read, and
   * goes on as `start` does once both are open, or reads the chosen profile's settings and
   * progress again and makes it active once both are open. A retry already running is reused.
   */
  readonly retryStart: () => Promise<void>;
  /** Resolves when every write queued so far has settled. Call before quitting. */
  readonly flush: () => Promise<void>;
  /** Whether a read or write is queued or running, so quitting now could drop a write. */
  readonly hasPendingWork: () => boolean;

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
  /**
   * Makes a profile active and loads its documents, or makes none active with null. When its
   * settings or progress cannot be read, it does not stay active and the status is `unavailable`.
   */
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

  /**
   * Starts loading an activity's state for the active profile. Repeat calls reuse the first load,
   * except after a read that failed, which they try again.
   */
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

/**
 * How long one bridge call of the session may take, in milliseconds. A document is a small JSON
 * file and a picture a few megabytes, which a slow laptop's disk reads or writes in well under a
 * second. The paint studio's picture calls use the same bound.
 */
export const SESSION_CALL_DEADLINE_MS = 10_000;

/**
 * A bridge call whose answer has a deadline. `answer` settles the way the call does, or rejects
 * at the deadline. `landed` settles when the call really ends, however late.
 */
interface HeldCall<T> {
  readonly answer: Promise<T>;
  readonly landed: Promise<T>;
}

/** The part of the bridge the session uses. */
interface SessionBridge {
  readonly info: PlatformBridge['info'];
  /** A write's answer has a deadline; the document's queue waits for `landed`. */
  readonly documents: Omit<DocumentStore, 'write'> & {
    write(name: DocumentName, text: string): HeldCall<void>;
  };
  readonly pictures: PictureStore;
  readonly window: Pick<PlatformBridge['window'], 'setKioskLock'>;
}

/**
 * The bridge with a deadline on every call the session makes. A call that does not answer in time
 * rejects with an `io` BridgeError, the same failure a broken disk gives, so the session handles it
 * the way it already handles that. A late answer is dropped. The store keeps only this object, and
 * the types list every method of a store, so a new call cannot skip the deadline.
 */
function boundedBridge(bridge: PlatformBridge, timers: Pick<Scheduler, 'setTimeout'>, ms: number): SessionBridge {
  function held<A extends unknown[], T>(what: string, call: (...args: A) => Promise<T>): (...args: A) => HeldCall<T> {
    return (...args) => {
      let work: Promise<T>;
      try {
        work = call(...args);
      } catch (error) {
        work = Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
      const landed = work.catch((error: unknown) => {
        throw toBridgeError(error);
      });
      // Whoever waits only for the answer must not see `landed` reject unhandled.
      landed.catch(() => undefined);
      const answer = withDeadline(work, ms, timers, `The bridge call ${what}`).catch((error: unknown) => {
        throw toBridgeError(error);
      });
      return { answer, landed };
    };
  }
  function bound<A extends unknown[], T>(what: string, call: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
    const heldCall = held(what, call);
    return (...args) => heldCall(...args).answer;
  }
  const { documents, pictures, window } = bridge;
  return {
    info: bound('info', () => bridge.info()),
    documents: {
      read: bound('documents.read', (name) => documents.read(name)),
      write: held('documents.write', (name, text) => documents.write(name, text)),
      setAside: bound('documents.setAside', (name) => documents.setAside(name)),
      removeProfile: bound('documents.removeProfile', (profileId) => documents.removeProfile(profileId)),
    },
    pictures: {
      save: bound('pictures.save', (profileId, input) => pictures.save(profileId, input)),
      list: bound('pictures.list', (profileId, place) => pictures.list(profileId, place)),
      read: bound('pictures.read', (profileId, id, file) => pictures.read(profileId, id, file)),
      copy: bound('pictures.copy', (profileId, id) => pictures.copy(profileId, id)),
      trash: bound('pictures.trash', (profileId, id) => pictures.trash(profileId, id)),
      restore: bound('pictures.restore', (profileId, id) => pictures.restore(profileId, id)),
      purge: bound('pictures.purge', (profileId, id) => pictures.purge(profileId, id)),
    },
    window: { setKioskLock: bound('window.setKioskLock', (on) => window.setKioskLock(on)) },
  };
}

const systemClock: SessionClock = {
  now: () => Date.now(),
  monotonic: () => performance.now(),
};

/** An update waiting for its document to load. A method, so a cell of a narrower type still fits a wider one. */
interface EarlyUpdate<T> {
  apply(current: T): T;
}

/** One saved document held in memory. */
class Cell<T> {
  value: T;
  loaded = false;
  writeQueued = false;
  /** Reads and writes of this cell queued or running, including a write past its deadline. */
  tasks = 0;
  /**
   * Set when the read failed or passed its deadline. The cell then stays unloaded with its value
   * untouched, so nothing writes defaults over the saved file. A required cell is read again in
   * place by `retryStart`; any other cell is never written and a fresh cell reads the file again.
   */
  unreadable = false;
  /** Updates made before the load finished, oldest first. They apply in one queued task. */
  readonly early: EarlyUpdate<T>[] = [];
  readonly ready: Promise<void>;
  private markReady: () => void = () => {};

  readonly name: DocumentName;
  readonly spec: DocumentSpec<T>;
  /** The app cannot go on without the saved value: defaults would hide or overwrite it. */
  readonly required: boolean;

  constructor(name: DocumentName, spec: DocumentSpec<T>, required = false) {
    this.name = name;
    this.spec = spec;
    this.required = required;
    this.value = spec.defaults();
    this.ready = new Promise((resolve) => {
      this.markReady = resolve;
    });
  }

  finishLoad(): void {
    this.loaded = true;
    this.markReady();
  }

  /** Ends the load of a cell that is not required without a value, so updates waiting for it are dropped. */
  giveUp(): void {
    this.unreadable = true;
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

function isCellOf<T, S extends T>(cell: Cell<T>, spec: DocumentSpec<S>): cell is Cell<S> {
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
  const { audio } = options;
  const timers = options.timers ?? systemScheduler();
  const bridge = boundedBridge(options.bridge, timers, SESSION_CALL_DEADLINE_MS);
  const clock = options.clock ?? systemClock;
  const queues = createSerialQueues();
  const listeners = new Set<() => void>();
  // Defaults in place of either would hide the children's profiles, and the next write would
  // replace them, so the app waits for both.
  const app = new Cell(documentNames.app, appDocument, true);
  const profiles = new Cell(documentNames.profiles, profilesDocument, true);
  /** Profiles whose files are being removed. Their pictures take no more changes. */
  const removed = new Set<string>();
  /**
   * The profile that was chosen but whose settings or progress could not be read. It is not
   * active, the status is `unavailable`, and `retryStart` chooses it again.
   */
  let unopened: string | null = null;
  /**
   * Documents with a read or write still queued or running, by name. Choosing a profile again, or
   * opening an activity's state again, takes the cell from here instead of reading the file, which
   * may not have the newest value yet. A cell leaves once its queue is empty.
   */
  const busyCells = new Map<DocumentName, Cell<unknown>>();
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
      activityStates[activityId] = {
        loaded: cell.loaded,
        unreadable: cell.unreadable,
        state: cell.value.state,
        spec: cell.spec,
      };
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
    if (app.unreadable || profiles.unreadable || unopened !== null) return 'unavailable';
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

  /**
   * `queued` false reads at once instead of behind the document's queue. Only a retry of a
   * required document does that: while it is unloaded, the only tasks on its queue are updates
   * waiting for this very read, so a queued read would wait for them forever.
   */
  async function readInto<T>(cell: Cell<T>, queued = true): Promise<void> {
    const read = () => loadDocument(bridge.documents, cell.name, cell.spec);
    let result: LoadResult<T>;
    try {
      result = await (queued ? runFor(cell, read) : read());
    } catch (error) {
      // loadDocument never throws on bad data. This covers a bridge that broke its contract.
      result = { value: cell.spec.defaults(), status: 'unreadable', problem: toBridgeError(error).message };
    }
    // Defaults never stand in for a document that could not be read: the next write would put
    // them over the saved file. Only a read that answered "nothing saved" or "set aside" gives them.
    cell.unreadable = result.status === 'unreadable';
    if (cell.unreadable) {
      if (!cell.required) {
        cell.giveUp();
        leaveUnopened(cell);
      }
      emit();
      return;
    }
    if (result.status === 'reset') {
      loadProblems = [...loadProblems, { document: cell.name, status: result.status, problem: result.problem ?? '' }];
    }
    cell.value = result.value;
    cell.finishLoad();
    if (result.status === 'migrated') queueWrite(cell);
    emit();
  }

  /**
   * A profile whose settings or progress could not be read does not stay active, so nothing
   * reads, shows, or writes defaults in their place. The status says `unavailable` until a retry.
   */
  function leaveUnopened(cell: Cell<unknown>): void {
    if (active === null || (active.settings !== cell && active.progress !== cell)) return;
    unopened = active.profileId;
    active = null;
  }

  /** Runs a read or write of the cell in its document's queue, and keeps the cell findable meanwhile. */
  function runFor<T, R>(cell: Cell<T>, task: () => Promise<R>): Promise<R> {
    cell.tasks += 1;
    busyCells.set(cell.name, cell);
    const result = queues.run(cell.name, task);
    void result
      .finally(() => {
        cell.tasks -= 1;
        if (cell.tasks === 0 && busyCells.get(cell.name) === cell) busyCells.delete(cell.name);
      })
      .catch(() => undefined);
    return result;
  }

  /**
   * The cell of a profile document. While an earlier cell of the same document still has work
   * queued, that cell is the truth, so it is used again; otherwise a new cell reads the file.
   */
  function openCell<T>(name: DocumentName, spec: DocumentSpec<T>): Cell<T> {
    const busy = busyCells.get(name);
    if (busy !== undefined && isCellOf(busy, spec)) return busy;
    const cell = new Cell(name, spec);
    load(cell);
    return cell;
  }

  function queueWrite<T>(cell: Cell<T>): void {
    if (cell.writeQueued) return;
    cell.writeQueued = true;
    void runFor(cell, async () => {
      // Writes the newest value when the turn comes, so a burst of updates costs one write.
      cell.writeQueued = false;
      await writeNow(cell);
    });
  }

  async function writeNow<T>(cell: Cell<T>): Promise<void> {
    let landed: Promise<void> = Promise.resolve();
    const documents = {
      write(name: DocumentName, text: string): Promise<void> {
        const call = bridge.documents.write(name, text);
        landed = call.landed;
        return call.answer;
      },
    };
    try {
      await saveDocument(documents, cell.name, cell.spec, cell.value);
      clearProblem(cell.name);
      return;
    } catch (error) {
      reportProblem(cell.name, 'write', error);
    }
    // A write past its deadline may still land. Until it ends, no later read or write of this
    // document passes it, so the disk never takes an older value after a newer one.
    try {
      await landed;
      clearProblem(cell.name);
    } catch (error) {
      reportProblem(cell.name, 'write', error);
    }
  }

  function change<T>(cell: Cell<T>, update: Update<T>): void {
    if (cell.loaded && cell.early.length === 0) {
      // Parsing first throws on a bad value before anything changes, and applies the schema's trims.
      cell.value = cell.spec.schema.parse(applyUpdate(cell.value, update));
      queueWrite(cell);
      emit();
      return;
    }
    // An update before the load finishes applies to the loaded value, not to the defaults. It
    // joins the document's queue now, right behind the read, so a later read of the same
    // document, such as when the profile is chosen again, waits until this update is on disk.
    cell.early.push({ apply: (current) => applyUpdate(current, update) });
    if (cell.early.length > 1) return;
    void runFor(cell, async () => {
      await cell.ready;
      if (!cell.loaded) {
        // The read failed, so there is no saved value to apply these updates to. They are dropped,
        // as is any later update until a fresh cell reads the file, and the screen says it did
        // not open.
        cell.early.length = 0;
        return;
      }
      for (const early of cell.early.splice(0)) {
        try {
          cell.value = cell.spec.schema.parse(early.apply(cell.value));
        } catch (error) {
          // A bad value can no longer throw to the caller, so it is logged as the bug it is.
          console.error(error);
        }
      }
      emit();
      await writeNow(cell);
    });
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
    unopened = null;
    if (profileId === null) {
      active = null;
      return;
    }
    active = {
      profileId,
      settings: openCell(documentNames.settings(profileId), settingsDocument),
      progress: openCell(documentNames.progress(profileId), progressDocument),
      activityStates: new Map(),
      startedAt: clock.monotonic(),
      grantedMs: 0,
    };
  }

  function chooseProfile(profileId: string | null): void {
    if (unopened === null && (active?.profileId ?? null) === profileId) return;
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
    if (active?.profileId === profileId || unopened === profileId) chooseProfile(null);
    removed.add(profileId);
    try {
      // Writes already queued for this profile finish first, so none lands after the removal. A
      // write past its deadline holds its queue until it ends, so this wait has a deadline too.
      const pending = Promise.all([queues.settled(`profile/${profileId}/`), queues.settled(`pictures/${profileId}`)]);
      await withDeadline(pending, SESSION_CALL_DEADLINE_MS, timers, `Saving profile ${profileId} before its removal`);
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

  /** `reopen` reads a state whose last read failed again, for the activity's "try again". */
  function activityCell<S>(activityId: string, spec: DocumentSpec<ActivityStateDocument<S>>, reopen = false) {
    const profile = requireActive('Activity state');
    const existing = profile.activityStates.get(activityId);
    if (existing !== undefined) {
      if (!isCellOf(existing, spec)) {
        throw new Error(`Activity ${activityId} opened its state with two different specs. Define the spec once.`);
      }
      if (!(reopen && existing.unreadable)) return existing;
    }
    const cell = openCell(documentNames.activity(profile.profileId, activityId), spec);
    profile.activityStates.set(activityId, cell);
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

  /**
   * Reads the required documents that are not open yet, and once both are, makes the last active
   * profile active and turns kiosk lock back on. With either unreadable it returns, and the status
   * says `unavailable`. `before` is work that must finish before a profile becomes active, such
   * as reading the test info that fixes the seed of the first round.
   */
  async function open(queued: boolean, before?: Promise<void>): Promise<void> {
    await Promise.all([
      app.loaded ? undefined : readInto(app, queued),
      profiles.loaded ? undefined : readInto(profiles, queued),
      before,
    ]);
    if (!app.loaded || !profiles.loaded) return;
    const last = app.value.lastActiveProfileId;
    if (last !== null && profiles.value.profiles.some((p) => p.id === last)) activate(last);
    if (app.value.kioskLock) void setKioskLock(true);
    emit();
    await Promise.all([active?.settings.ready, active?.progress.ready]);
  }

  /** Chooses again the profile whose documents could not be read, and waits for them. */
  async function reopenProfile(profileId: string): Promise<void> {
    chooseProfile(profileId);
    await Promise.all([active?.settings.ready, active?.progress.ready]);
  }

  audio?.onVolumeChange(onEngineVolume);
  let started = false;
  let retrying: Promise<void> | null = null;

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,

    async start() {
      if (started) throw new Error('The session already started.');
      started = true;
      const info = (async () => {
        try {
          testInfo = (await bridge.info()).test ?? null;
        } catch {
          // Not a test run, or a bridge that could not say: the app runs as usual.
        }
      })();
      await open(true, info);
    },

    retryStart() {
      if (!started) throw new Error('The session has not started.');
      if (statusOf() !== 'unavailable') return Promise.resolve();
      retrying ??= (unopened === null ? open(false) : reopenProfile(unopened)).finally(() => {
        retrying = null;
      });
      return retrying;
    },

    flush: () => queues.settled(),
    hasPendingWork: () => queues.busy(),

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
      const before = active?.activityStates.get(activityId);
      if (activityCell(activityId, spec, true) !== before) emit();
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
