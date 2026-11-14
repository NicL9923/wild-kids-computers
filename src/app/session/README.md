# Session

The session holds the saved documents of the app and of the active profile, and writes changes back through the bridge. Screens read and change them with the hooks in [sessionHooks.ts](sessionHooks.ts). No feature calls the bridge directly.

`main.tsx` creates one store, starts it, and wraps the app in `<SessionProvider>` and `<AudioProvider>`. `RootLayout` applies the active profile's band, text size, letter spacing, and reduced motion through `ThemeRoot`. The store gives the audio engine the profile's voice volume, effects volume, and mute, and saves a change made on the engine, such as by the mute control. With no active profile, the app uses `band-3-5` and the default settings.

## Guarantees

- **Bad saved data never crashes.** A corrupt document is set aside and replaced with defaults. `useStorageProblems().loadProblems` lists what happened.
- **Writes land in order.** Writes to one document run one after another, and a burst of updates coalesces into the fewest writes that end with the newest value. A read waits behind writes queued for the same document, so it never brings back an older value.
- **An update before a document loads waits for it**, so it applies to the saved value and not to the defaults.
- **A failed write never rejects.** The change stays on screen, and `useStorageProblems().saveProblem` says what failed. The next successful write of the same target clears it.
- **A bad value throws at once.** Updates are checked against the document's schema before anything changes. A value the schema rejects is a bug in the caller.
- **Picture calls resolve to a result**, `{ ok: true, value }` or `{ ok: false, error }`, and never reject.
- **No bridge call holds the session forever.** Every call the store makes ends after `SESSION_CALL_DEADLINE_MS` as an `io` failure. A timed-out read counts as unreadable for that attempt and sets nothing aside; a timed-out write is a `saveProblem`. A late answer is dropped.
- **The app never guesses at the children it has.** When the app or profiles document cannot be read, the status is `unavailable`, nothing is replaced with defaults, and nothing is written until `retryStart()` reads them.

## Hooks

| Hook                                 | What it gives                                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `useSessionStatus()`                 | `'loading'`, `'unavailable'`, `'needs-first-launch'`, `'needs-profile'`, or `'ready'`                           |
| `useAppDocument()`                   | `app`, `updateApp(change)`, and `setKioskLock(on)`, which saves the lock and applies it to the window           |
| `useProfiles()`                      | `profiles`, `createProfile`, `updateProfile`, `deleteProfile`, and `chooseProfile(id \| null)`                  |
| `useActiveProfile()`                 | The active `Profile`, or null                                                                                   |
| `useBand()`                          | The active band, or `band-3-5`                                                                                  |
| `useThemeSettings()`                 | Band, text size, letter spacing, and motion. `RootLayout` already applies them.                                 |
| `useSettings()`                      | `settings` and `updateSettings(change)`. Settings are the defaults with no profile, and updating then throws.   |
| `useProgress()`                      | `progress`, `progressOf(activityId)`, `recordRound(id, outcome, difficulty?)`, and `recordStep(id, step)`       |
| `useActivityState(activityId, spec)` | `state`, `loaded`, and `update(fn)` for `profile/<id>/activity/<activity-id>`                                   |
| `usePictures()`                      | `list`, `read`, `save`, `copy`, `trash`, `restore`, and `purge` for the active profile. Throws with no profile. |
| `useTestInfo()`                      | The seed, difficulty, band, and activity an end-to-end test passed, or null                                     |
| `useSessionLength()`                 | `isLimitReached()`, `playedMs()`, and `grantPlayTime(ms)`. Nothing re-renders on time. Call them when needed.   |
| `useStorageProblems()`               | `saveProblem`, the newest failed write, and `loadProblems`, documents that came back as defaults                |
| `useSessionStore()`                  | The store itself, for `flush()` before quitting and `retryStart()` from the start screen                        |

## Status

| Status               | When                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `loading`            | The app or profiles document is loading, or the chosen profile's settings or progress are |
| `unavailable`        | The app or profiles document could not be read. The start screen offers to try again.     |
| `needs-first-launch` | `firstLaunchDone` is false, or no profile exists, such as after the last one is deleted   |
| `needs-profile`      | Profiles exist and none is active                                                         |
| `ready`              | A profile is active and loaded                                                            |

At start the store makes `app.lastActiveProfileId` active when that profile still exists, so a returning child lands on the home map. The first-launch flow can create and choose a profile while the status is still `needs-first-launch`. The theme follows the chosen profile from then on. The flow sets `firstLaunchDone` last.

## Examples

Route by status in the shell:

```tsx
const status = useSessionStatus();
if (status === 'loading') return null;
if (status === 'needs-first-launch') return <Navigate to="/first-launch" />;
if (status === 'needs-profile') return <Navigate to="/profiles" />;
```

Create a profile during first launch, then finish:

```ts
const { createProfile, chooseProfile } = useProfiles();
const { updateApp, setKioskLock } = useAppDocument();
const profile = createProfile({ avatarId: 'fox', colorId: 'sky', band: 'band-3-5' });
chooseProfile(profile.id);
await setKioskLock(kioskChosen);
updateApp({ firstLaunchDone: true });
```

Set a parent PIN. Hash it first; the PIN itself is never stored:

```ts
updateApp({ parentPin: await hashParentPin(pin) });
```

Change a setting from the parent corner:

```ts
const { settings, updateSettings } = useSettings();
updateSettings({ sessionLengthMinutes: 30 });
updateSettings((current) => ({ ...current, voiceVolume: current.voiceVolume / 2 }));
```

Record a finished round. The activity kit computes the next difficulty and passes it in:

```ts
const { progressOf, recordRound, recordStep } = useProgress();
const next = nextDifficulty(progressOf('pop-the-seed-pods'), band);
recordRound('pop-the-seed-pods', { mistakes: 1, hintsUsed: 0 }, next);
recordStep('typing-course', 4); // The furthest step the child can now reach. It never moves back.
```

Save an activity's own state. Define the spec once at module level, because the store refuses a second spec for the same activity:

```ts
const lessonState = activityStateDocument({
  schema: z.object({ furthestLesson: z.int().min(0) }),
  defaults: () => ({ furthestLesson: 0 }),
});

const { state, loaded, update } = useActivityState('typing-course', lessonState);
update((current) => ({ furthestLesson: current.furthestLesson + 1 }));
```

Save and list pictures:

```ts
const pictures = usePictures();
const saved = await pictures.save({ png, thumbnail });
if (!saved.ok) return; // useStorageProblems().saveProblem already says why.
const gallery = await pictures.list('gallery');
```

Check the session length between rounds. Play time starts when a profile is chosen and resets when the profile changes or the app restarts. It is off until a parent sets `sessionLengthMinutes`. The limit is reached at exactly the set length.

```ts
const { isLimitReached } = useSessionLength();
if (isLimitReached()) navigate({ to: '/rest' });
```

Delete a profile. Its documents and pictures go too, after any write already queued for it lands. When it was active, no profile is active afterwards:

```ts
const result = await deleteProfile(profile.id);
if (!result.ok) showProblem(result.error.code);
```

## Tests

[testing/fakeBridge.ts](testing/fakeBridge.ts) is a `PlatformBridge` for unit tests. Documents and pictures live in memory, every call is logged in order, and window and output calls throw unless the test configures them. `holdWrites()` parks writes so a test controls when each one finishes, and `failNext(...)` makes one call reject. Create a store with `createSessionStore({ bridge, audio, clock, timers })`, where `clock` gives `now()` and `monotonic()`, to pin time, and `timers` is a manual scheduler that steps the bridge call deadline.

```ts
const fake = createFakeBridge({ documents: { app: '...', profiles: '...' }, test: { seed: 7 } });
const store = createSessionStore({ bridge: fake.bridge, clock: { now: () => wall, monotonic: () => mono } });
await store.start();
render(<SessionProvider store={store}>...</SessionProvider>);
```
