# Architecture

This file is the build contract for milestone 1. The [product spec](spec.md) says what the app does. This file says how the code is organized so that many contributors can add activities, tools, and effects without editing the same files.

When this file and the code disagree, fix one of them in the same change.

## Process model

| Process | Code | Rules |
| --- | --- | --- |
| Main | `electron/main/` | Owns the window, the `app://` protocol, the network block, file storage, export, print, and kiosk lock. |
| Preload | `electron/preload/` | Exposes one object, `window.wkBridge`, through `contextBridge`. It contains no logic beyond forwarding typed IPC calls. |
| Renderer | `src/` | React app. No Node access. Context isolation and the sandbox stay on. |

The renderer loads from `app://bundle/index.html`. The main process serves that scheme from the packaged renderer build. The app never loads `file://` or `http://` content, except the Vite dev server on `localhost` when the app is unpackaged and `WKC_DEV_SERVER_URL` is set.

### Network block

All of these apply at once. Each has a test.

1. `session.webRequest.onBeforeRequest` cancels every request whose URL is not `app://bundle/...`, `devtools://...`, `blob:` or `data:` created by the app. The dev server origin is allowed only in unpackaged dev runs.
2. Chromium switches turn off background networking, component updates, and DNS resolution for outside hosts.
3. The `app://` responses carry a content security policy that allows only `'self'`, plus `blob:` and `data:` for images and media.
4. `will-navigate`, `will-redirect`, `setWindowOpenHandler`, and `will-attach-webview` deny everything.
5. Every permission request is denied.
6. `tools/checkDependencies.ts` fails when `package.json` or the lockfile contains a denied package. The deny list covers HTTP clients, analytics, crash reporting, and auto-update packages.

The end-to-end no-network test starts a local HTTP server, tries `fetch`, `XMLHttpRequest`, `WebSocket`, an `<img>`, `window.open`, and a navigation from the renderer, and asserts that each fails and that the server saw zero requests.

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

A central list file causes a merge conflict every time two people add an item. The app finds items by file convention with `import.meta.glob`, which works in Vite and in Vitest.

| Item | Convention |
| --- | --- |
| Activity definition | `src/features/**/activity.ts`, default export from `defineActivity` |
| Strings | `src/**/strings.ts`, named export `strings` from `defineStrings` |
| Paint tool | `src/core/paint/tools/<toolId>/index.ts` |
| Brush tip | `src/core/paint/tips/<tipId>.ts` |
| Paint effect | `src/core/paint/effects/<effectId>/index.ts` |
| Coloring page | `assets/coloring/<page-id>.svg` plus an entry file `src/features/paint-studio/coloringPages/<pageId>.ts` |
| Robot puzzle | `src/features/robot-painter/puzzles/<tier>/<puzzleId>.ts` |

Each item carries an explicit `order` number where display order matters. A test fails on a duplicate id.

Do not add a hand-maintained array of activities, tools, effects, or strings.

## Strings and voice

Every user-facing string lives in a `strings.ts` file next to the code that uses it.

```ts
export const strings = defineStrings('pop-the-seed-pods', {
  title: { text: 'Pop the seed pods' },
  goal: { text: 'Click a large target that stays still.' },
  instruction: { text: 'Click a seed pod to pop it.', spoken: true },
});
```

- `defineStrings` returns typed handles. Code calls `t(strings.instruction)` and `speak(strings.instruction)`. A missing key is a compile error.
- A namespace is unique across the app. A test fails on a duplicate namespace.
- A string with `spoken: true` needs a voice clip. Strings shown in `band-3-5` are spoken unless they are parent-facing.
- Parent corner text is not spoken unless the spec says a step is spoken, such as the first-launch flow.
- Interpolation uses named slots, such as `'Find the letter {letter}.'`. A spoken string with slots declares the full set of values it can take, so that every variant has a clip. Prefer composing short clips over many variants.

### Voice clips

- Clips live in `assets/voice/en/`. The file name is a hash of the voice profile and the exact text: `voiceClipName(text)` in `src/core/strings/voice.ts`. The generator and the runtime share that one function.
- Because the name comes from the text, a changed string has no clip until someone generates it. Two strings with the same text share one clip.
- `npm run voice:generate` creates missing clips with Kokoro-82M and encodes them as mono Opus in an Ogg container. The generator lives in `tools/voice/` with its own `package.json`, so its dependencies stay out of the app.
- `npm run check:voice` fails when a spoken string has no clip. It also fails when a clip matches no string, so the folder holds no stale audio.
- The voice profile records the model, voice, and speed. Changing it renames every clip, which forces regeneration.

## Assets and licenses

- Each directory under `assets/` has a `LICENSES.json` file. An entry has `files` (an exact name or a glob within that directory), `source`, `author`, and `license`.
- `npm run check:licenses` walks every file under `assets/`. It fails when a file matches no entry, when an entry matches no file, or when a license is outside the allowed set: MIT, Apache-2.0, CC0-1.0, CC-BY-4.0, OFL-1.1.
- The production build runs this check first.
- Fluent Emoji files live in `assets/emoji/`. Import them with `tools/importEmoji.ts`, which copies from a local clone of the upstream repository and keeps the upstream MIT notice in `assets/emoji/LICENSE`.
- Sound effects are synthesized at runtime with the Web Audio API in `src/audio/sfx/`. They are original work and add no files.
- Original art is SVG, authored in this repository, and licensed MIT.

## Platform bridge

`src/core/platform/bridge.ts` defines `PlatformBridge`. The renderer never imports Electron. It calls `getBridge()`, which returns the Electron implementation when `window.wkBridge` exists and the browser implementation otherwise.

The contract covers:

- **Documents.** Read, write, and set aside a named JSON document. Names come from a fixed set of patterns, such as `profiles` and `profile/<id>/progress`.
- **Pictures.** Save a PNG with its thumbnail, list, read, copy, move to trash, restore, and purge, per profile.
- **Window.** Fullscreen, kiosk lock, close request, and quit.
- **Export and print.** Save a PNG to a place the adult chooses, and print a PNG.
- **Info.** Operating system family, app version, and whether the app runs in Electron.

Rules:

- The main process validates every IPC argument with Zod and rejects calls from any frame that is not the app's own page.
- The main process writes files atomically: write a temporary file, then rename.
- The bridge moves bytes and text. Schema validation of documents happens in `src/core/storage/`, so both implementations share it.
- One contract test suite in `e2e/bridge/` runs against the Electron app and against the browser build.

## Storage

- `src/core/storage/` holds one Zod schema per document, each with a `version` field and a migration chain.
- `loadDocument` reads the text, parses it, migrates it, and validates it. On any failure it asks the bridge to set the file aside under a `.corrupt-<timestamp>` name and returns defaults. It never throws on bad saved data.
- Each guard has a test that feeds it the bad input: invalid JSON, a wrong type, a missing field, an unknown version, an oversized document.
- Pictures are PNG files. The gallery index is rebuilt from the files when it is missing or corrupt.

Documents:

| Document | Contents |
| --- | --- |
| `app` | Schema version, first-launch state, kiosk lock, parent PIN hash and salt, last active profile |
| `profiles` | List of profiles: id, avatar, color, band, optional name |
| `profile/<id>/settings` | Voice volume, effects volume, mute, text size, letter spacing, reduced motion, session length, export and print gate |
| `profile/<id>/progress` | Per activity: difficulty, recent outcomes, days practiced |

## Activity kit

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

| Field | Meaning |
| --- | --- |
| `id` | Kebab-case, unique |
| `area` | `computer-skills`, `toy-desktop`, `early-learning`, or `robot-painter` |
| `order` | Position within the area |
| `bands` | The bands it serves |
| `goal` | A string handle for the one learning goal, in plain words a parent can read |
| `title`, `icon` | A string handle and an art reference |
| `inputs` | Input needs: `pointer-move`, `click`, `drag`, `double-click`, `right-click`, `scroll`, `zoom`, `keyboard`, `text-entry` |
| `difficulty` | Per band, the lowest and highest level on a 1 to 10 scale |
| `roundsPerSession` | How many rounds before the finish screen |
| `generateLevel` | `(seed, difficulty, band) => Level`. Pure. No clock, no `Math.random`. |
| `spoken` | The string handles the activity speaks. The first is the main instruction. |
| `load` | `() => import('./<Name>Activity')` |

`activity.ts` and `level.ts` import nothing from React. The component receives the level, the band, and a kit handle. It reports `kit.roundComplete({ mistakes, hintsUsed })`.

### What the kit supplies

- **Instruction player.** Speaks the main instruction when a round starts and shows a replay control that is always visible. Bands above `band-3-5` also show the text.
- **Feedback.** A gentle confirmation for a correct action and a neutral nudge for a wrong one. No character shows disappointment. A wrong action never ends the round.
- **Difficulty adjustment.** `src/core/activityKit/difficulty.ts` is a pure model. It raises the level after clean rounds and lowers it after rounds with many mistakes, within the range for the band.
- **Exit control.** A fixed place on every activity screen. It returns to the area screen.
- **Finish screen.** After `roundsPerSession` rounds the child sees a calm screen with two equal choices: play again, or go back. It shows no score, star, or count.
- **Scope.** `kit.scope` owns every timer, animation frame, listener, and sound the activity starts. Leaving the activity cancels all of them. Activities call `scope.setTimeout`, `scope.setInterval`, `scope.requestFrame`, and `scope.listen`. They never call the global timer functions. A lint rule bans the global timer functions under `src/features/`.
- **Clock.** `kit.clock` gives wall time and monotonic time. Tests pin it.
- **Random.** `createRandom(seed)` gives a seeded generator. Level generators receive a seed, never a generator shared across rounds.
- **Drag with click alternative.** `useCarry` implements one interaction for moving things. The child can press, drag, and release, or click to pick up and click to place. Every drag in the app uses it. Do not write pointer-capture drag code in an activity.
- **Session length.** The kit checks the session limit only between rounds, then routes to the closing screen.

### Hard rule checks

| Rule | Check |
| --- | --- |
| One goal, bands, spoken strings | Registry test over every definition |
| An end-to-end test per activity | Registry test checks that `e2e/activities/<id>.spec.ts` exists |
| Click before drag | Registry test: an activity with `drag` in `inputs` must use `useCarry`, and its end-to-end test must contain a test named "click to place" |
| Double-click and right-click only where taught | A test scans `src/` for double-click and context-menu handlers outside an allow list |
| No manipulative design | A test scans every string for banned reward words, with an allow list for false positives such as the star shape |
| Spoken instructions | `check:voice` |
| Timers cancelled on exit | The lint rule above, plus a kit test that the scope cancels everything |

### End-to-end tests

- Tests run against the built Electron app with Playwright under a virtual display.
- `e2e/support/` has `launchApp({ band, seed })`. It creates a temporary user data directory with a ready profile, so a test starts at the home map or directly at an activity.
- A fixed seed makes levels repeatable. A test imports the activity's `generateLevel` and computes the answer from the same seed. It does not read the answer out of the page.
- Each activity test completes one round with real input events and asserts something the child would notice, such as the finish screen or a counted object on screen.
- Each test calls `expectAccessible(page)`, which runs axe with WCAG 2.2 AA tags.
- Each test saves a screenshot per band it serves to `test-results/screens/<band>/<activity-id>.png` for review.
- The app exposes test hooks only when `WKC_TEST=1`: a log of voice clips and sounds played, and the pinned clock.

Build activities from DOM and SVG elements with real buttons and labels. Use `<canvas>` only where the content is a picture, such as the paint studio and the robot's drawing.

## Paint engine

`src/core/paint/` is a software rasterizer over typed arrays. It does not use the Canvas 2D API, the DOM, or any font or image decoder from the platform. The same bytes come out on every machine, so tests compare images exactly.

- **Document.** A fixed 1600 by 1000 RGBA paint layer, plus an optional line-art mask for coloring pages. The mask sits above the paint and bounds the fill tool.
- **Tools.** Each tool is a module with one interface: begin, move, end, cancel. A tool returns the rectangle it changed.
- **Brush tips.** A tip is a small module that produces dabs. Rainbow and pattern tips are tips, not tools.
- **Effects.** Each effect is a module with one interface and a group: `distort`, `color`, `paint-on`, or `whole-picture`. A paint-on effect behaves like a brush. A whole-picture effect transforms the document.
- **Stamps and line art.** The engine receives decoded RGBA bitmaps. The renderer decodes SVG and PNG. Tests load PNG fixtures.
- **Text.** The text tool turns glyph outlines from a bundled font into paths and fills them with the engine's own path filler.
- **Random effects.** Effects that scatter things take a seed.
- **Undo.** Each step stores the previous pixels of the changed rectangle. Undo swaps them with the current pixels, so a step holds one copy. The cap is sized so that 30 full-canvas steps fit. "Start over" is a normal step.
- **Input.** The studio reads `getCoalescedEvents()` and feeds every point to the tool. It draws only the changed rectangle to the screen once per animation frame.
- **Sticky pen.** A click without movement puts the pen down, and the next click lifts it. Press, drag, and release also works. This is the click alternative to drag for every paint tool.

### Image comparison method

Paint tests run in Node with Vitest. Each test builds a document, runs a scripted tool or effect, and compares the result with a golden PNG in `src/core/paint/__goldens__/`. The comparison is exact, byte for byte, after decoding. No browser, GPU, or system font takes part, so the developer machine and CI produce the same pixels. `.node-version` pins Node, and with it the math library. `npm run paint:goldens` rewrites goldens. Review every changed golden image before committing it.

## Design tokens

- `src/styles/tokens.css` holds every size, color, radius, and duration as a CSS custom property.
- The smallest target size per band is one token, `--wk-target-min`. The band theme sets it to 72, 56, or 44 CSS px. Components use the token and never a literal size.
- A band theme is a `data-band` attribute on the app root. Reduced motion is a `data-motion` attribute. Text size and letter spacing are tokens that the parent corner changes.
- Color is never the only signal. Pair it with shape, icon, or text.

## Quality gates

| Command | What it runs |
| --- | --- |
| `npm run lint` | Oxlint with type-aware rules |
| `npm run format:check` | Oxfmt for TypeScript, Prettier for CSS, JSON, and Markdown |
| `npm run typecheck` | The type checker over `src`, `electron`, `e2e`, and `tools` |
| `npm test` | Vitest unit tests, including paint goldens and the registry test |
| `npm run test:tz` | The unit tests again under a timezone east of UTC |
| `npm run check` | Licenses, voice, dependencies, and strings checks |
| `npm run e2e` | Playwright against Electron |
| `npm run e2e:browser` | Bridge contract tests and a load test against the browser build |
| `npm run mutation` | Stryker on paint math, level generators, the difficulty model, and storage validation |
| `npm run perf` | Performance measurements. Prints numbers and does not gate. |
| `npm run dist` | Unsigned installer for the current operating system |
