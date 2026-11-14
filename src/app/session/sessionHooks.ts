import { use, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Band } from '../../core/bands.ts';
import type { TestInfo } from '../../core/platform/testInfo.ts';
import type { DocumentSpec } from '../../core/storage/document.ts';
import type {
  ActivityProgress,
  ActivityStateDocument,
  AppDocument,
  Profile,
  ProgressDocument,
  Settings,
} from '../../core/storage/schemas.ts';
import type { ThemeSettings } from '../theme/theme.ts';
import { SessionContext } from './sessionContext.ts';
import {
  isEntryOf,
  type BridgeResult,
  type LoadProblem,
  type NewProfile,
  type ProfilePictures,
  type SaveProblem,
  type SessionSnapshot,
  type SessionStatus,
  type SessionStore,
  type Update,
} from './sessionStore.ts';

/** The session store itself, for the rare caller that needs `flush()` or the whole snapshot. */
export function useSessionStore(): SessionStore {
  const store = use(SessionContext);
  if (store === null) throw new Error('Session hooks need a SessionProvider above them.');
  return store;
}

/** Re-renders when the selected part of the snapshot changes. `select` must return a stored value, not a new object. */
function useSnapshot<T>(select: (snapshot: SessionSnapshot) => T): T {
  const store = useSessionStore();
  return useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()));
}

/** Where the app is: loading, needs first launch, needs a profile choice, or ready. */
export function useSessionStatus(): SessionStatus {
  return useSnapshot((s) => s.status);
}

/** The app document and a function to change it. */
export function useAppDocument(): {
  app: AppDocument;
  updateApp: (update: Update<AppDocument>) => void;
  setKioskLock: (on: boolean) => Promise<BridgeResult<void>>;
} {
  const store = useSessionStore();
  const app = useSnapshot((s) => s.app);
  return useMemo(() => ({ app, updateApp: store.updateApp, setKioskLock: store.setKioskLock }), [app, store]);
}

/** Every profile, and the functions that add, change, remove, and choose them. */
export function useProfiles(): {
  profiles: readonly Profile[];
  createProfile: (profile: NewProfile) => Profile;
  updateProfile: (profileId: string, update: Update<NewProfile>) => void;
  deleteProfile: (profileId: string) => Promise<BridgeResult<void>>;
  chooseProfile: (profileId: string | null) => void;
} {
  const store = useSessionStore();
  const profiles = useSnapshot((s) => s.profiles);
  return useMemo(
    () => ({
      profiles,
      createProfile: store.createProfile,
      updateProfile: store.updateProfile,
      deleteProfile: store.deleteProfile,
      chooseProfile: store.chooseProfile,
    }),
    [profiles, store],
  );
}

/** The active profile, or null before one is chosen. */
export function useActiveProfile(): Profile | null {
  return useSnapshot((s) => s.activeProfile);
}

/** The active profile's band, or the youngest band when no profile is active. */
export function useBand(): Band {
  return useSnapshot((s) => s.theme.band);
}

/** What the app root applies to every screen: band, text size, letter spacing, and motion. */
export function useThemeSettings(): ThemeSettings {
  return useSnapshot((s) => s.theme);
}

/** The active profile's settings, or the defaults with no profile. `updateSettings` throws with no profile. */
export function useSettings(): { settings: Settings; updateSettings: (update: Update<Settings>) => void } {
  const store = useSessionStore();
  const settings = useSnapshot((s) => s.settings);
  return useMemo(() => ({ settings, updateSettings: store.updateSettings }), [settings, store]);
}

/** The active profile's progress, and the functions that record a finished round or step. */
export function useProgress(): {
  progress: ProgressDocument;
  progressOf: (activityId: string) => ActivityProgress | undefined;
  recordRound: SessionStore['recordRound'];
  recordStep: SessionStore['recordStep'];
} {
  const store = useSessionStore();
  const progress = useSnapshot((s) => s.progress);
  const progressOf = useCallback((activityId: string) => progress.activities[activityId], [progress]);
  return useMemo(
    () => ({ progress, progressOf, recordRound: store.recordRound, recordStep: store.recordStep }),
    [progress, progressOf, store],
  );
}

/**
 * State one activity saves for the active profile, in `profile/<id>/activity/<activity-id>`.
 * Define `spec` once at module level with `activityStateDocument(...)`. Until the saved state
 * loads, `state` is the defaults and `loaded` is false. Updates made before then wait for it.
 * When it cannot be read, `unreadable` is true, updates are dropped, and `reopen` reads it again.
 */
export function useActivityState<S>(
  activityId: string,
  spec: DocumentSpec<ActivityStateDocument<S>>,
): { state: S; loaded: boolean; unreadable: boolean; update: (update: (state: S) => S) => void; reopen: () => void } {
  const store = useSessionStore();
  const entry = useSnapshot((s) => s.activityStates[activityId]);
  const reopen = useCallback(() => store.openActivityState(activityId, spec), [store, activityId, spec]);
  useEffect(reopen, [reopen]);
  const update = useCallback(
    (change: (state: S) => S) => store.updateActivityState(activityId, spec, change),
    [store, activityId, spec],
  );
  return useMemo(() => {
    // Before the effect opens the state, or with an entry from another spec, which the store refuses.
    if (entry === undefined || !isEntryOf(entry, spec)) {
      return { state: spec.defaults().state, loaded: false, unreadable: false, update, reopen };
    }
    return { state: entry.state, loaded: entry.loaded, unreadable: entry.unreadable, update, reopen };
  }, [entry, spec, update, reopen]);
}

/** The active profile's pictures. Each call resolves to a result and never rejects. Throws with no profile. */
export function usePictures(): ProfilePictures {
  const store = useSessionStore();
  const profileId = useSnapshot((s) => s.activeProfile?.id ?? null);
  // A new object only when the profile changes, so it is safe in effect dependencies.
  return useMemo(() => {
    if (profileId === null) throw new Error('usePictures needs an active profile.');
    return store.pictures();
  }, [store, profileId]);
}

/** The seed, difficulty, band, and activity an end-to-end test passed, or null outside a test. */
export function useTestInfo(): TestInfo | null {
  return useSnapshot((s) => s.testInfo);
}

/**
 * Play time for the active profile. Nothing here interrupts the child: the activity kit calls
 * `isLimitReached()` between rounds and decides what to show.
 */
export function useSessionLength(): {
  isLimitReached: () => boolean;
  playedMs: () => number;
  grantPlayTime: (ms: number) => void;
} {
  const store = useSessionStore();
  return useMemo(
    () => ({
      isLimitReached: store.isSessionLimitReached,
      playedMs: store.playedMs,
      grantPlayTime: store.grantPlayTime,
    }),
    [store],
  );
}

/** The newest failed write, and the documents that came back as defaults after a bad load. */
export function useStorageProblems(): { saveProblem: SaveProblem | null; loadProblems: readonly LoadProblem[] } {
  const saveProblem = useSnapshot((s) => s.saveProblem);
  const loadProblems = useSnapshot((s) => s.loadProblems);
  return useMemo(() => ({ saveProblem, loadProblems }), [saveProblem, loadProblems]);
}
