# Architecture

This file is the build contract for milestone 1. The [product spec](spec.md) says what the app does. This file says how the code is organized so that many contributors can add activities, tools, and effects without editing the same files.

When this file and the code disagree, fix one of them in the same change.

## Process model

| Process  | Code                | Rules                                                                                                                   |
| -------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Main     | `electron/main/`    | Owns the window, the `app://` protocol, the network block, file storage, export, print, and kiosk lock.                 |
| Preload  | `electron/preload/` | Exposes one object, `window.wkBridge`, through `contextBridge`. It contains no logic beyond forwarding typed IPC calls. |
| Renderer | `src/`              | React app. No Node access. Context isolation and the sandbox stay on.                                                   |

The renderer loads from `app://bundle/index.html`. The main process serves that scheme from the packaged renderer build. The app never loads `file://` or `http://` content, except the Vite dev server on `localhost` when the app is unpackaged and `WKC_DEV_SERVER_URL` is set.

The main process registers `app` as a privileged scheme with `standard`, `secure`, `supportFetchAPI`, `corsEnabled`, and `stream`. Module scripts, `fetch` of voice clips, and media playback need those.

### Content security policy

The `app://` handler sends this policy as a response header. The production renderer build also carries it as a `<meta>` tag, so the browser build has it too. The dev server does not carry it.

```
default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

Inline styles are allowed because Radix adds `<style>` tags for scroll locking. No source outside the bundle is allowed anywhere.

### Keyboard and clipboard ownership

- The main process sets an application menu with only the edit commands, which macOS needs for text fields. On macOS, Undo and Redo from the menu bar go to the page over `MENU_COMMAND_CHANNEL`, and `src/app/menuCommands.ts` replays them as the shortcut on the focused element, so an activity's own text model handles them instead of the browser's undo. Windows and Linux hide the menu bar and keep the plain edit role. It blocks reload, close, quit, zoom, and developer tools shortcuts in `before-input-event` unless the app runs unpackaged in dev. It fixes the zoom factor at 1.
- The app never reads or writes the system clipboard. `src/app/` handles `copy`, `cut`, and `paste` events at the document root and routes them to an in-app toy clipboard. An adult's copied password cannot land in a toy app, and a child's text cannot leave the app. Text inside an element marked `data-no-copy`, such as the pretend password in Secrets stay secret, is never copied or cut, even by a Select all that reaches over it.
- The app root cancels every `dragstart`, so images do not produce ghost drags.
- Spellcheck is off.

### Network block

All of these apply at once. Each has a test.

1. `session.webRequest.onBeforeRequest` cancels every request whose URL is not `app://bundle/...`, `devtools://...`, `blob:` or `data:` created by the app. The dev server origin, including its `ws:` socket, is allowed only in unpackaged dev runs.
2. Chromium switches turn off background networking, component updates, hyperlink auditing pings, and DNS resolution for every host name except the dev server's in a dev run. WebRTC is limited to `disable_non_proxied_udp` through `webContents.setWebRTCIPHandlingPolicy`, because the Chromium switch for it has no effect in Electron 45.
3. The session uses a proxy that does not exist (`fixed_servers` mode, `<-loopback>` bypass), so a request that slips past the filter fails closed, including one to this machine. Dev runs bypass the proxy for the dev server only.
4. The spellchecker is off and its dictionary download URL points nowhere.
5. The content security policy above.
6. `will-navigate`, `will-redirect`, `setWindowOpenHandler`, and `will-attach-webview` deny everything.
7. Every permission request and permission check is denied.
8. `tools/checkDependencies.ts` fails when `package.json` or the lockfile contains a denied package. The deny list covers HTTP clients, analytics, crash reporting, and auto-update packages. It also fails when a production dependency has a license outside a permissive allow list.

The end-to-end no-network test starts a local HTTP server on a free port. From the renderer it tries `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, an `<img>`, a `<link rel="dns-prefetch">`, a fetch from a Worker, a WebRTC peer connection, `window.open`, and a navigation. It asserts that each fails and that the server saw zero requests.

A second end-to-end test asserts hard rule 8: `process` and `require` are undefined in the page, `window.wkBridge` holds only the bridge functions, and the renderer process is sandboxed. On Linux the test reads the renderer's seccomp status from `/proc`.

`e2e/network/layers.spec.ts` observes each main-process layer on its own, so a layer cannot go missing behind the others. Playwright's keyboard skips `before-input-event`, so the shortcut test sends keys with `webContents.sendInputEvent`.

End-to-end tests run against the unpackaged build, so installer fuses never affect them. On GitHub's Ubuntu runner the workflow sets `kernel.apparmor_restrict_unprivileged_userns=0` so that Chromium's sandbox can start. Tests never pass `--no-sandbox`.

## Repository layout

```
electron/
  main/                 main process
  preload/              the bridge preload
src/
  core/                 no React, no Electron, no DOM globals at import time
    paint/              paint engine
    activityKit/        activity definition types, seeded random, difficulty model, scope
    storage/            Zod schemas, migrations, load-or-default logic
    strings/            defineStrings, voice clip naming
    platform/           PlatformBridge contract types
  platform/             bridge implementations: electron (IPC) and browser (browser storage)
  audio/                voice player, sound effects synth, volume and mute
  registry/             the import.meta.glob registries: activities, strings, paint tools, tips, effects
  app/                  router, layout, providers, home map, first launch, profiles, parent corner
  components/ui/        owned UI primitives
  activityShell/        React side of the activity kit: instruction player, feedback, exit, finish screen
  features/
    paint-studio/
    computer-skills/activities/<activity-id>/
    toy-desktop/        desktop simulator, toy apps, lessons/<activity-id>/
    early-learning/activities/<activity-id>/
    robot-painter/
  styles/               Tailwind entry, design tokens, band themes
assets/                 fonts, emoji, voice, art. Every file has a license entry.
e2e/                    Playwright tests. e2e/activities/<activity-id>.spec.ts, one per activity
tools/                  build, check, and generation scripts
docs/
```

Module files use camelCase. Component files use PascalCase and the `.tsx` extension. Feature and activity directories use kebab-case. An activity id is kebab-case and matches its directory name.

## Discovery instead of central lists

A central list file causes a merge conflict every time two people add an item. The app finds items by file convention with `import.meta.glob`.

`import.meta.glob` exists only in Vite and Vitest. These rules keep it contained:

- Only files in `src/registry/` call `import.meta.glob`. `src/core/` exports types and builders and never globs.
- Anything that needs a registry outside the app runs under Vitest, including the string, voice, and registry checks.
- `activity.ts`, `level.ts`, and `strings.ts` import no assets, no CSS, and no registry, so Playwright tests can import them directly.
- One route, `/activity/$activityId`, serves every activity. Adding an activity never touches the router.

### Routes

A feature adds screens in its own `routes.ts` or `routes.tsx`, which exports `routes`, an array of routes whose parent is `rootRoute`. `src/registry/routes.ts` finds every such file and `src/app/router.ts` adds them to the tree, so no feature edits the router. A test fails when two routes match the same path, and the error names both files.

```tsx
import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { rootRoute, type FeatureRoutes } from '../../app/rootRoute.ts';

const PaintStudio = lazyRouteComponent(() => import('./PaintStudio.tsx'));
export const routes: FeatureRoutes = [
  createRoute({ getParentRoute: () => rootRoute, path: '/paint', component: PaintStudio }),
];
```

Each route path has one owner: `src/app/paths.ts` for the shell's screens, `src/activityShell/paths.ts` for the area and activity screens, and `src/features/paint-studio/paths.ts` for the studio and its gallery. Everything else, end-to-end tests included, imports the constant. `tools/sourceRules.test.ts` fails on a route literal outside its owner.

Load each screen with `lazyRouteComponent`, because the registry imports every routes file at start. The router keeps hash history. TanStack Router cannot type a tree it finds by file convention, so the router is not registered for path types: a screen parses its own search parameters, as `parseGallerySearch` does, and links take plain strings.

| Item                | Convention                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| Route               | `src/**/routes.ts` or `src/**/routes.tsx`, named export `routes`                                         |
| Activity definition | `src/features/**/activity.ts`, default export from `defineActivity`                                      |
| Strings             | `src/**/strings.ts` and the shared sets in `src/core/strings/shared/*.ts`, named export `strings`        |
| Paint tool          | `src/core/paint/tools/<toolId>/index.ts`                                                                 |
| Brush tip           | `src/core/paint/tips/<tipId>.ts`                                                                         |
| Paint effect        | `src/core/paint/effects/<effectId>/index.ts`                                                             |
| Stamp category      | `src/features/paint-studio/stamps/<categoryId>.ts`                                                       |
| Coloring page       | `assets/coloring/src/<page-id>.svg` plus its entry `src/features/paint-studio/coloringPages/<pageId>.ts` |
| Robot puzzle        | `src/features/robot-painter/puzzles/<tier>/<puzzleId>.ts`                                                |

Each item carries an explicit `order` number where display order matters. A test fails on a duplicate id.

Do not add a hand-maintained array of activities, tools, effects, or strings.

## Strings and voice

Every user-facing string lives in a `strings.ts` file next to the code that uses it.

```ts
export const strings = defineStrings('pop-the-seed-pods', {
  title: { text: 'Pop the seed pods' },
  goal: { text: 'Click a large target that stays still.', silent: 'parent' },
  instruction: { text: 'Click a seed pod to pop it.' },
});
```

- `defineStrings` returns typed handles. Code calls `t(strings.instruction)` and `speak(strings.instruction)`. A missing key is a compile error.
- A namespace is unique across the app. A test fails on a duplicate namespace.
- A string is spoken by default and needs a voice clip. A string that is never spoken says why: `silent: 'parent'` for parent corner text, or `silent: 'decorative'` for text that only an older child reads and that repeats something already spoken. The first-launch flow is spoken.
- A string can carry a `speech` field when the clip must say something other than the shown text. Letter sounds need it, because a speech model reads the letter "b" as its name.
- Strings have no interpolation. Compose a sentence from clips with `speakSequence([strings.find, letters.b])`. Shared clip sets for letters, numbers, colors, and shapes live in `src/core/strings/shared/` so every activity says them the same way.
- The example above omits `spoken` because it is the default.

### Voice clips

- Clips live in `assets/voice/en/`. The file name is a hash of the voice profile and the speech text: `voiceClipName(speech)` in `src/core/strings/voice.ts`. The generator and the runtime share that one function.
- The hash is a synchronous pure TypeScript hash of at least 64 bits. The text is normalized first: Unicode NFC, collapsed whitespace, straight quotes.
- Because the name comes from the text, a changed string has no clip until someone generates it. Two strings with the same speech share one clip.
- `npm run voice:generate` creates missing clips with Kokoro-82M and encodes them as mono Opus in an Ogg container. The generator lives in `tools/voice/` with its own `package.json`, so its dependencies stay out of the app. It reads the list of spoken strings from a file that a Vitest task writes.
- `src/registry/voiceClips.ts` finds the clips. It imports them with `?no-inline`, because the content security policy blocks fetching a `data:` URL.
- `npm run check:voice` fails when a spoken string has no clip. It also fails when a clip matches no string, so the folder holds no stale audio. It fails on a hash collision between two different texts.
- The voice profile records the model, voice, and speed. Changing it renames every clip, which forces regeneration.
- During parallel work, feature branches do not generate clips. The coordinator generates clips on the integration branch after each merge. `check:voice` gates the integration branch and CI, not a feature branch. A missing clip at runtime plays nothing and still records the string in the test log.

## Assets and licenses

- Each directory under `assets/` has a `LICENSES.json` file. An entry has `files` (an exact name or a glob within that directory), `source`, `author`, and `license`.
- `npm run check:licenses` walks every file under `assets/`. It fails when a file matches no entry, when an entry matches no file, or when a license is outside the allowed set: MIT, Apache-2.0, CC0-1.0, CC-BY-4.0, OFL-1.1.
- The production build runs this check first.
- Fluent Emoji files live in `assets/emoji/`. Import them with `tools/importEmoji.ts`, which copies from a local clone of the upstream repository and keeps the upstream MIT notice in `assets/emoji/LICENSE`.
- Sound effects are synthesized at runtime with the Web Audio API in `src/audio/sfx/`. They are original work and add no files.
- Original art is SVG, authored in this repository, and licensed MIT.
- A build check fails when a non-code file in the renderer output did not come from `assets/`. `npm run build` runs it as `check:build-assets` after the renderer build. It matches files by content, because Vite renames them.

## Platform bridge

`src/core/platform/bridge.ts` defines `PlatformBridge`. The renderer never imports Electron. It calls `getBridge()`, which returns the Electron implementation when `window.wkBridge` exists and the browser implementation otherwise.

The contract covers:

- **Documents.** Read, write, and set aside a named JSON document, and remove everything of one profile. Names come from a fixed set of patterns in `src/core/platform/names.ts`, such as `profiles` and `profile/<id>/progress`.
- **Pictures.** Save a PNG with its thumbnail, list, read, copy, move to trash, restore, and purge, per profile. Purge works only on a trashed picture.
- **Window.** Fullscreen, kiosk lock, close request, and quit. With kiosk lock on, a close attempt calls the renderer's `onCloseRequest` listener. The renderer calls `acknowledgeCloseRequest()` at once and `quit()` after the parent gate passes. Without an answer within 3 seconds, the main process destroys the window, because a hung page never finishes its unload handlers. Before it calls `quit()`, the renderer's quit flow (`src/app/kiosk/closeRequest.ts`) finishes the work screens hold in its registry, such as an unsaved picture, and the session's queued writes. With kiosk lock off the window closes without asking, so the page holds the close back with `beforeunload` while anything is unsaved, finishes it, and quits. Work that has not finished after 5 seconds no longer holds the app open.
- **Export and print.** Save a PNG to a place the adult chooses, and print a PNG.
- **Info.** Operating system family, app version, and whether the app runs in Electron. With `WKC_TEST=1` it also returns the `test` object that `launchApp` passed in `WKC_TEST_INFO`.

Errors reject with a `BridgeError` whose `code` is `invalid-argument`, `too-large`, `not-found`, `forbidden`, or `io`. Over IPC the main process answers with a result envelope, because Electron flattens a thrown error into a string.

Rules:

- The main process validates every IPC argument with Zod and rejects calls from any frame that is not the app's own page.
- The main process writes files atomically: write a temporary file, flush it, then rename. Writes to one file run in call order.
- The Electron build keeps data under `<userData>/data/`: `app.json`, `profiles.json`, and `profile/<id>/` with `settings.json`, `progress.json`, `activity/<activity-id>.json`, and `pictures/` with a `trash/` folder. The browser build keeps the same names in IndexedDB.
- In a test run the page exposes the bridge it uses as `window.wkcTest.bridge`. The Electron app does this only with `WKC_TEST=1`. The browser build does it with a `wkc-test` query parameter, which grants nothing the page could not already do.
- The bridge moves bytes and text. Schema validation of documents happens in `src/core/storage/`, so both implementations share it.
- One contract test suite, `e2e/bridge/contract.ts`, runs against the Electron app from `e2e/bridge/electron.spec.ts` and against the browser build from `e2e/browser/bridge.spec.ts`.

## Storage

- `src/core/storage/` holds one Zod schema per document, each with a `version` field and a migration chain.
- `loadDocument` reads the text, parses it, migrates it, and validates it. On any failure it asks the bridge to set the file aside under a `.corrupt-<timestamp>` name and returns defaults. It never throws on bad saved data. A read the platform could not perform returns defaults with status `unreadable` and moves nothing.
- `migrations[n]` turns version n into n + 1, and the chain sets `version` after each step. `src/core/storage/document.test.ts` proves the chain with a test-only document that migrates from version 0 to 2.
- Lists that grow with use, such as recent rounds and practice days, are trimmed by the schema instead of rejected, so a busy year never resets progress.
- Each guard has a test that feeds it the bad input: invalid JSON, a wrong type, a missing field, an unknown version, an oversized document.
- Pictures are PNG files. The gallery index is rebuilt from the files when it is missing or corrupt.

Documents:

| Document                              | Contents                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `app`                                 | Schema version, first-launch state, kiosk lock, parent PIN hash and salt, last active profile                               |
| `profiles`                            | List of profiles: id, avatar, color, band, optional name                                                                    |
| `profile/<id>/settings`               | Voice volume, effects volume, mute, text size, letter spacing, reduced motion, session length, export and print gate        |
| `profile/<id>/progress`               | Per activity: difficulty, recent outcomes, days practiced                                                                   |
| `profile/<id>/activity/<activity-id>` | State that one activity owns, such as the furthest typing lesson. The activity definition supplies the schema and defaults. |

Screens read and write these documents through the session in `src/app/session/`, never through the bridge. Its [README](../src/app/session/README.md) lists the hooks and what they guarantee: writes to one document land in order, a read never brings back an older value, and a failed write becomes a state a screen can show.

An activity never edits a shared schema to save its own state. It declares `state: { schema, defaults }` in its definition and reads and writes through `kit.state`.

## Activity kit

[adding-an-activity.md](adding-an-activity.md) is the how-to with copyable skeletons. This section is the contract.

### Definition

Each activity has one directory:

```
src/features/<area>/activities/<activity-id>/
  activity.ts          the definition, default export
  level.ts             generateLevel, a pure function
  level.test.ts
  strings.ts
  <Name>Activity.tsx   the component, default export
e2e/activities/<activity-id>.spec.ts
```

`defineActivity` takes:

| Field              | Meaning                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | Kebab-case, unique                                                                                                                                        |
| `area`             | `computer-skills`, `toy-desktop`, `early-learning`, or `robot-painter`                                                                                    |
| `order`            | Position within the area                                                                                                                                  |
| `bands`            | The bands it serves                                                                                                                                       |
| `goal`             | A string handle for the one learning goal, in plain words a parent can read                                                                               |
| `title`, `icon`    | A spoken string handle, and `{ emoji }` or `{ art }`: an emoji id, or a path under `assets/art/activities/` without `.svg`                                |
| `kind`             | `rounds`, `sequence`, or `free`. See below.                                                                                                               |
| `inputs`           | Input needs: `pointer-move`, `click`, `drag`, `double-click`, `right-click`, `scroll`, `zoom`, `keyboard`, `text-entry`                                   |
| `difficulty`       | For `rounds`: per band, the lowest and highest level on a 1 to 10 scale                                                                                   |
| `roundsPerSession` | For `rounds`: how many rounds before the finish screen                                                                                                    |
| `generateLevel`    | `(seed, difficulty, band) => Level`. Pure. No clock, no `Math.random`. For `sequence`, the second argument is the step index. For `free`, `(seed, band)`. |
| `steps`            | For `sequence`: the ordered, authored steps, each with an id                                                                                              |
| `stepsDirectory`   | For `sequence`: where the step modules live, relative to the activity's directory, or `null` for inline steps                                             |
| `state`            | Optional `{ schema, defaults }` for state the activity saves per profile                                                                                  |
| `spoken`           | The string handles the activity speaks. The first is the main instruction.                                                                                |
| `load`             | `() => import('./<Name>Activity')`                                                                                                                        |

`activity.ts` and `level.ts` import nothing from React. `defineActivity` in `src/core/activityKit/defineActivity.ts` checks the definition and throws on a mistake. `src/registry/activities.ts` finds every definition, and `src/registry/activityArt.ts` finds the art. The component receives the level, the band, and a kit handle, typed `ActivityProps<Level>` in `src/activityShell/kit.ts`. It reports `kit.roundComplete()`, which uses the mistakes and hints the kit counted, or `kit.roundComplete({ mistakes, hintsUsed })` to override them. A component uses no randomness of its own. Anything random comes from the level. A lint rule bans `Math.random` under `src/features/` and `src/core/`.

### Activity kinds

| Kind       | Shape                                                                                                                                                                                           | Examples                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `rounds`   | The kit generates a level from a seed and a difficulty, the child plays it, and the difficulty model adjusts. A finish screen follows `roundsPerSession` rounds.                                | Most activities                                           |
| `sequence` | An ordered list of authored steps. The kit saves the furthest step and lets the child pick any step up to it. `kit.stepSolved()` opens the next step before the step ends. No difficulty model. | Typing course, shortcut workshop, each robot painter tier |
| `free`     | Open play with no rounds and no finish screen.                                                                                                                                                  | Robot free mode, toy desktop free play                    |

Robot painter has one `sequence` activity per tier and one `free` activity. Each puzzle is a step, with a unit test that its reference solution solves it. Each toy desktop lesson is its own activity.

The seed for a round comes from `roundSeed(sessionSeed, roundIndex)` in core. Tests use the same function.

### What the kit supplies

- **Instruction player.** Speaks the main instruction when a round starts and shows a replay control that is always visible. Bands above `band-3-5` also show the text. An activity whose instruction changes within a round calls `kit.setInstruction(handleOrSequence)`, and the replay control then plays that. Pass `{ shown }` when the instruction line must show less than the voice says, such as a sound the child is asked to match to its letter.
- **Speech.** `kit.speak(handle)` and `kit.speakSequence([...])` play clips through the scope, so leaving cancels them. `kit.hint(say?)` counts a hint. `kit.play(name)` and `kit.startSound(name)` play effects.
- **Feedback.** `kit.feedback.correct({ at, say, silent })` gives a soft chime and a check mark. `kit.feedback.wrong(...)` gives a low nudge and an open ring in a quiet color, and counts a mistake. No character shows disappointment. A wrong action never ends the round.
- **Difficulty adjustment.** `src/core/activityKit/difficulty.ts` is a pure model. It raises the level by one after two clean rounds in a row at the current level, and lowers it by one right after a round with three or more mistakes and hints together, within the range for the band. Each saved round records the level it was played at. A test's difficulty is clamped into the band's range.
- **Exit control.** A fixed place on every activity screen. It returns to the area screen.
- **Finish screen.** After `roundsPerSession` rounds the child sees a calm screen with two equal choices: play again, or go back. It shows no score, star, or count.
- **Scope.** `kit.scope` owns every timer, animation frame, listener, and sound the activity starts. Leaving the activity cancels all of them. Activities call `scope.setTimeout`, `scope.setInterval`, `scope.requestFrame`, and `scope.listen`. They never call the global timer functions. A lint rule bans the global timer functions under `src/features/`.
- **Clock.** `kit.clock` gives wall time and monotonic time. Tests pin it.
- **Random.** `createRandom(seed)` gives a seeded generator. Level generators receive a seed, never a generator shared across rounds.
- **Drag with click alternative.** `useCarry` implements one interaction for moving things. The child can press, drag, and release, or click to pick up and click to place. It supports drop targets, free positions such as a window on the toy desktop, and movement limited to an axis and a range such as a slider or a resize handle. A carried item also moves with the arrow keys and drops with Enter. Every drag in the app uses it. A lint rule bans `draggable`, `onDrag*` handlers, and `setPointerCapture` outside the kit and the paint studio.
- **Drag exemptions.** Native form controls and text selection are exempt, because the platform already gives them a keyboard alternative. The exemption list lives next to the lint rule.
- **Pictures.** `kit.pictures` lists the profile's gallery pictures for activities that use them, such as the jigsaw. Activities do not call the bridge.
- **Session length.** The kit checks the session limit only between rounds, after a 1.2 second pause and the end of the speech in progress, and when it is reached routes to `CLOSING_PATH` (`/closing`) from `src/app/paths.ts`. `src/activityShell/paths.ts` exports `AREA_PATH(areaId)` and `ACTIVITY_PATH(id)`.
- **Area screen.** `/area/$areaId` shows the activities of an area that serve the profile's band as picture tiles that speak their titles on hover and focus. It is the only step between the home map and an activity.

### Hard rule checks

| Rule                                           | Check                                                                                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One goal, bands, spoken strings                | Registry test over every definition                                                                                                                                           |
| An end-to-end test per activity                | Registry test checks that `e2e/activities/<id>.spec.ts` exists                                                                                                                |
| Click before drag                              | Registry test: an activity with `drag` in `inputs` must use `useCarry`, and its end-to-end test must contain a test named "click to place"                                    |
| Double-click and right-click only where taught | A test scans `src/` for double-click and context-menu handlers outside an allow list                                                                                          |
| No manipulative design                         | A test scans every string for banned reward words, with an allow list for false positives such as the star shape                                                              |
| Spoken instructions                            | `check:voice`                                                                                                                                                                 |
| Timers cancelled on exit                       | The lint rule above, plus a kit test that the scope cancels everything                                                                                                        |
| Levels are pure                                | Registry test: `generateLevel` gives the same level twice for the same arguments, at each band's lowest and highest difficulty                                                |
| Playwright can import an activity              | Registry test: `activity.ts`, `level.ts`, and `strings.ts` import no registry, asset, CSS, React, or `.tsx` file                                                              |
| No forgotten sequence step                     | Registry test: the files in `stepsDirectory` equal the ids in `steps`                                                                                                         |
| Native drag only in the kit                    | Oxlint rule `wkc/no-native-drag`, with its exemption list `NATIVE_DRAG_EXEMPT` in `tools/oxlintPlugin.ts`                                                                     |
| Original work only                             | A test scans strings and file names for the names of the two reference apps, their mascot, and "magic", Tux Paint's name for its effects. This catches only the obvious case. |

### End-to-end tests

- Tests run against the built Electron app with Playwright under a virtual display.
- `e2e/support/` has `launchApp({ band, seed, difficulty, activity })`. It creates a temporary user data directory with a ready profile. `openActivity(...)` in `e2e/support/activity.ts` launches it at 1280 by 800 and opens `/activity/<id>`. `forEachBand(bands, body)` repeats tests per band.
- A fixed seed and difficulty make levels repeatable. A test imports the activity's `generateLevel` and `roundSeed` and computes the answer. It does not read the answer out of the page.
- `e2e/support/` has `expectInstructionSpoken(page, handle)`, which presses the replay control and asserts that the clip for that string played.
- The clock is real by default. A test that needs to control time passes `pinClockAt` and steps with `kitTime(page).advance(ms)` or `.stepFrames(n)`, through `window.wkcKitTime`. Every scope runs on one switchable scheduler, `kitScheduler` in `src/activityShell/kitTime.ts`.
- A keyboard-only test walks the shell screens: first launch, profile choice, home map, an area screen, and the parent corner.
- Each activity test completes one round with real input events and asserts something the child would notice, such as the finish screen or a counted object on screen.
- Each test calls `expectAccessible(page)`, which runs axe with WCAG 2.2 AA tags.
- Each test saves a screenshot per band it serves to `reports/screens/<band>/<activity-id>.png` for review, with `saveBandScreenshot(page, band, id, variant?)`. Shell and studio tests use `saveScreen` from `e2e/support/screens.ts`. Playwright empties `test-results/` on every run, so screenshots never go there.
- The app exposes test hooks only when `WKC_TEST=1` and it runs unpackaged: a log of voice clips and sounds played, and the pinned clock. The packaged app ignores `WKC_TEST` and its test user data directory, and removes the `--remote-debugging-*` switches before Chromium reads them (`electron/main/testMode.ts`). A probe of an `electron-builder --dir` build kept the debugging port closed and the test directory empty.

Build activities from DOM and SVG elements with real buttons and labels. Use `<canvas>` only where the content is a picture, such as the paint studio and the robot's drawing.

## Paint engine

`src/core/paint/` is a software rasterizer over typed arrays. It does not use the Canvas 2D API, the DOM, or any font or image decoder from the platform. The same bytes come out on every machine, so tests compare images exactly.

- **Document.** A fixed 1600 by 1000 RGBA paint layer, plus an optional line-art mask for coloring pages. The mask is a separate static layer that sits above the paint and bounds the fill tool.
- **Math.** `src/core/paint/math.ts` holds the engine's own sine, cosine, arctangent, power, and similar functions, built only from addition, subtraction, multiplication, division, and `Math.sqrt`, which IEEE 754 rounds exactly. A lint rule bans `Math.sin`, `Math.cos`, `Math.tan`, `Math.atan`, `Math.atan2`, `Math.pow`, `**`, `Math.exp`, `Math.log`, and `Math.hypot` under `src/core/paint/`, because their last bit can differ between builds of V8.
- **Tools.** Each tool is a module with one interface: begin, move, end, cancel. A tool returns the rectangle it changed.
- **Brush tips.** A tip is a small module that produces dabs. Rainbow and pattern tips are tips, not tools.
- **Effects.** Each effect is a module with one interface and a group: `distort`, `color`, `paint-on`, or `whole-picture`. A paint-on effect behaves like a brush. A whole-picture effect is a pure function from source pixels to result pixels with a fixed cost per pixel, such as a precomputed sample map or a separable kernel.
- **Stamps and line art.** The engine receives decoded RGBA bitmaps. The renderer decodes SVG and PNG. Tests load PNG fixtures.
- **Text.** The text tool fills glyph outlines with the engine's own path filler. A build tool reads the font with a parser that only `tools/` uses and writes `assets/paint-fonts/<face>.glyphs.json`. The app ships the glyph table and no font parser.
- **Random effects.** Effects that scatter things take a seed.
- **Undo.** The canvas is divided into 64 px tiles. An operation copies a tile the first time it touches it, so a stroke stores only the tiles it changed. Undo swaps the saved tiles with the current pixels, so a step holds one copy. A step that replaces the document, such as "Start over" or opening a coloring page, also saves the mask. The cap is set in bytes, and a test proves that 30 full-canvas steps fit under it.
- **Input.** The studio reads `getCoalescedEvents()` and feeds every point to the tool. Once per animation frame it calls `putImageData` with the document-sized `ImageData` and the changed rectangle, so no pixels are copied to build a frame.
- **Worker.** The studio runs whole-picture effects and the autosave PNG encoding in a Web Worker so the screen never freezes and a fill never waits for a save. The engine itself stays synchronous, and tests call it directly.
- **Sticky pen.** A click without movement puts the pen down, and the next click lifts it. Press, drag, and release also works. This is the click alternative to drag for every paint tool.

A registry test fails when a tool, tip, or effect has no golden image test. [src/core/paint/README.md](../src/core/paint/README.md) explains the API and how to add a tool, tip, or effect.

### Image comparison method

Paint tests run in Node with Vitest. Each test builds a document, runs a scripted tool or effect, and compares the result with a golden PNG in `src/core/paint/__goldens__/`. The comparison is exact, byte for byte, after decoding. No browser, GPU, or system font takes part, and the engine's math uses only exactly rounded operations, so the developer machine and CI produce the same pixels. The paint suite fails when the running Node version differs from `.node-version`. `npm run paint:goldens` rewrites goldens. Review every changed golden image before committing it.

### Coloring pages

A coloring page is an original SVG line drawing in `assets/coloring/src/<page-id>.svg`: 1600 by 1000, round black lines, no fill, no text. `npm run coloring:render` draws each changed source with Playwright's Chromium and writes the mask `assets/coloring/<page-id>.png`, a four-bit palette PNG of black lines on a transparent page. The app decodes the mask at runtime and hands it to the engine as `doc.mask`, so the lines are the same pixels on every machine, and Node tests load the same file. Each mask stores the SHA-256 of its source in a `tEXt` chunk, so a test fails when a source changes without a new mask.

Each page has an entry, `src/features/paint-studio/coloringPages/<pageId>.ts`, from `defineColoringPage`: id, order, spoken title, bands youngest first, the mask and thumbnail URLs, a background point, and one point inside each region a child would color. `npm run coloring:regions -- <page-id>` prints the regions of a rendered mask, ready to paste.

`src/features/paint-studio/testing/coloringPageTests.ts` is the proof that the fill respects the lines, run by one `coloringPagesBand*.test.ts` file per band. For every page it fills from every point with the real fill tool and fails when the paint reaches the page edge, reaches another point, or covers more than its region. It also fails when a visible region has no point, when a source breaks the line rules for its youngest band, or when a page breaks its band's region count or smallest region size. Those rules are in `tools/coloringPages.ts`.

## Design tokens

- `src/styles/tokens.css` holds every size, color, radius, and duration as a CSS custom property.
- The smallest target size per band is one token, `--wk-target-min`. The band theme sets it to 72, 56, or 44 CSS px. Components use the token and never a literal size.
- A band theme is a `data-band` attribute on the app root. Reduced motion is a `data-motion` attribute. Text size and letter spacing are tokens that the parent corner changes.
- Color is never the only signal. Pair it with shape, icon, or text.

## Quality gates

| Command                | What it runs                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm run lint`         | Oxlint with type-aware rules                                                                                 |
| `npm run format:check` | Oxfmt for TypeScript, Prettier for CSS, JSON, and Markdown                                                   |
| `npm run typecheck`    | The type checker over `src`, `electron`, `e2e`, and `tools`                                                  |
| `npm test`             | Vitest unit tests, including paint goldens and the registry test                                             |
| `npm run test:tz`      | The unit tests again under a timezone east of UTC                                                            |
| `npm run check`        | Licenses, voice, dependencies, and strings checks                                                            |
| `npm run e2e`          | Playwright against Electron                                                                                  |
| `npm run e2e:browser`  | Bridge contract tests and a load test against the browser build                                              |
| `npm run mutation`     | Stryker on paint math, level generators, the difficulty model, and storage validation                        |
| `npm run perf`         | Performance measurements, including the time of each whole-picture effect. Prints numbers and does not gate. |
| `npm run dist`         | Unsigned installer for the current operating system                                                          |
