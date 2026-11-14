# App shell

The screens around the activities: first launch, the profile choice, the home map, the parent gate, the parent corner, kiosk lock, and the session closing screen. Saved data goes through the [session](session/README.md); visual building blocks come from [src/components/ui](../components/ui/README.md).

## Screens

| Path          | Screen                                                                                           | Code                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `/`           | First launch until it is done, the profile choice with several children, else on to the home map | [start/](start/), [first-launch/](first-launch/), [profile-choice/](profile-choice/) |
| `/home`       | The home map                                                                                     | [home/](home/)                                                                       |
| `/parent`     | The parent corner, behind the parent gate every time it opens                                    | [parent-corner/](parent-corner/)                                                     |
| `/closing`    | The calm closing screen after the session length is used up                                      | [closing/](closing/)                                                                 |
| anything else | A calm "not ready yet" screen with one button back to the meadow                                 | [shell/NotFound.tsx](shell/NotFound.tsx)                                             |

The paths live in [paths.ts](paths.ts). Paths other features own appear there once, as literals, until the coordinator unifies them.

## For other features

### The parent gate

Call it before export, print, quitting, or anything else a child must not do alone, and act only when it resolves true. The app never speaks the gate.

```ts
import { useParentGate } from '../../app/parent-gate/ParentGate.tsx';

const askParent = useParentGate();
if (await askParent('export')) await exportPicture();
```

The reasons are `parent-corner`, `export`, `print`, `quit`, and `closing`; each names the dialog's title. A second request while the gate is open shares the first one's answer. The paint studio's [parentGate.ts](../features/paint-studio/parentGate.ts) skips the gate when a parent turned off "Ask a grown-up before saving or printing".

### The session length

```ts
import { useSessionLimit } from '../../app/closing/useSessionLimit.ts';

const { closeIfLimitReached } = useSessionLimit();
if (closeIfLimitReached()) return; // the closing screen is on its way
```

Check only at a natural stopping point, never in the middle of what the child is doing:

- **The activity kit** checks between rounds.
- **The paint studio** checks when the pen is up.
- **The shell** checks on every change of screen, so the back button cannot leave the closing screen.

A grown-up can give ten more minutes from the closing screen. The time is added to the limit in the session store, so `useSessionLength().isLimitReached()` and this hook agree.

## Kiosk lock

With kiosk lock on, the main process sends a close request instead of closing. [kiosk/KioskCloseGuard.tsx](kiosk/KioskCloseGuard.tsx) acknowledges it at once, so the main process does not close after its 3 second timeout, then asks the parent gate. The app saves every queued write and quits only when the gate passes. Kiosk lock is best effort: the operating system keeps its own shortcuts.

## Forgotten PIN

The gate's "Forgot the PIN?" link and the [README](../../README.md#forgot-the-parent-pin) tell an adult to delete `app.json` from the data folder. The session treats a missing `app.json` as a first launch with profiles that already exist, so first launch asks only about sound and kiosk lock and never makes another profile. `e2e/shell/parentGate.spec.ts` walks this path.

## Tests

[testing/shellHarness.tsx](testing/shellHarness.tsx) renders the whole app on a memory history over the fake bridge, with an audio engine that logs what it would say. End-to-end tests are in `e2e/shell/`. In a test run, `window.wkcTestClock.advance(ms)` steps the session clock ([testClock.ts](testClock.ts)); `e2e/support/clock.ts` wraps it.
