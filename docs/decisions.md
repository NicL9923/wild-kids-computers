# Decisions

Choices the [product spec](spec.md) left open, with the reason for each. "Human" means Nicolas decided. "Agent" means an agent decided during the milestone 1 build and Nicolas has not reviewed it yet.

## Decided by human

- Milestone 1 is everything in the spec.
- The stack is Electron, TypeScript, React, Vite, and npm on Node. No Bun, no Rust, no Effect library.
- The license is MIT and the app is free.
- Radix primitives for parent-corner dialogs, camelCase module names, TanStack Router, and Zod for saved data.

## Decided by agent

### Build and tooling

- **esbuild bundles the main process and the preload. Vite bundles the renderer.** The sandboxed preload must be one CommonJS file, and two plain bundlers have fewer moving parts than an Electron-specific Vite wrapper.
- **`tsrs` checks types.** It is the checker Nicolas's other repositories use. TypeScript 7.0.2 is the language version.
- **`@types/node` follows the pinned Node major version**, not the newest types, so code cannot type check against an API the runtime lacks.
- **electron-builder's `electronFuses` option sets the fuses.** No separate fuses package.

### Network and security

- **The renderer loads from a privileged `app://` scheme**, not `file://`, so the content security policy can use `'self'`.
- **The app never touches the system clipboard.** Copy, cut, and paste go to an in-app toy clipboard. An adult's copied password cannot land in a toy app.
- **A dead proxy backs up the request filter**, so a request that slips past the filter still fails.
- **WebRTC is limited per web contents, not by a Chromium switch.** A probe on Electron 45 counted 16 UDP packets to a local STUN socket with the `force-webrtc-ip-handling-policy` switch and none with `setWebRTCIPHandlingPolicy`.
- **The dead proxy is `127.0.0.1:9`, and the app reloads the proxy config after setting it.** A probe showed real requests failing closed through the proxy from the first one, but `resolveProxy` reported DIRECT for the first lookup in a session until the reload. The reload makes the layer test see what requests see.
- **Copy, cut, and paste never fall back to the system clipboard, even when the toy clipboard is empty.** A paste with nothing copied in the app inserts nothing.
- **Root guards also cancel `dragover` and `drop`**, so text or files dropped from another program cannot carry system data in. Every drag in the app uses `useCarry`, so nothing needs native drops.
- **A close request that gets no answer within 3 seconds destroys the window.** A plain close waits for the page's unload handlers, which a hung page never finishes. A test measured 39 seconds with a plain close.
- **The renderer must answer a close request explicitly.** The preload does not answer for it, because a renderer that is alive but showing an error screen would then trap the child behind a gate that never appears.
- **Test runs reach the bridge through `window.wkcTest.bridge`.** The contract suite then exercises the exact object the app uses, in both builds.

### Storage

- **Saved data lives in `<userData>/data/`**, away from the files Chromium keeps in the user data directory.
- **The bridge adds `documents.removeProfile`**, because deleting a profile must remove activity documents whose names the parent corner cannot list.
- **Pictures have no index file.** The gallery lists the PNG files and sorts by modification time, so there is no index to fall out of step.
- **Bad saved data and a future version are both set aside.** A newer app's document stays on disk under the `.corrupt-<timestamp>` name, so a parent can recover it after updating again.
- **The parent PIN is 4 to 8 digits, hashed with PBKDF2-SHA256 at 600,000 iterations and a 16-byte salt.** That is OWASP's current minimum. The record stores the iteration count, so a later build can raise it. A short PIN stays guessable by anyone who can read the file; the hash only keeps it from being read in plain text.
- **Settings defaults:** voice volume 1, effects volume 0.6, not muted, standard text size and letter spacing, reduced motion follows the system, no session limit, and export and print behind the parent gate.

### Paint

- **The paint engine is a software rasterizer in TypeScript over typed arrays.** It removes the GPU and the font stack from image tests, so the same pixels come out on every machine and tests compare exactly.
- **The engine has its own trigonometry and power functions.** The built-in ones can differ in the last bit between builds of V8.
- **The canvas is 1600 by 1000 pixels.**
- **Every paint tool has a sticky pen.** A click puts the pen down and the next click lifts it. Hard rule 7 requires a click alternative to every drag, and a 3-year-old on a trackpad cannot hold a drag.
- **Undo copies 64 px tiles on first touch.** Thirty full-canvas steps cost about 192 MB at worst, which fits under the cap.
- **Whole-picture effects run in a Web Worker.** A measured kaleidoscope took 100 ms and a blur 200 ms on a fast laptop CPU, which would freeze a slow one.
- **The text tool fills glyph outlines from a table built at build time.** The app ships no font parser.
- **The paint text face is Andika Bold 7.000, shipped as the glyph table "Meadow Sans".** Bold strokes read better on a painting. "Andika" is a Reserved Font Name under the OFL, and a subset table is a modified version, so it takes another name.
- **Within one stroke, a pixel keeps the highest coverage any dab gave it.** Overlapping dabs never darken each other, so a see-through marker stays even and a soft brush shows no beads.
- **Outlines and lines are stroked by distance to the polyline, not by filling overlapping pieces.** Summing the coverage of overlapping pieces doubles their antialiased edges.
- **The fill bucket grows one pixel under line art and unmixes antialiased painted edges.** Neither leaves a pale fringe between the paint and a line.
- **A change that left every pixel as it was adds no undo step.** A fill in the color already there, or a stamp with no visible pixels, does not cost the child an undo.
- **The undo cap is 256 MiB and at most 100 steps.** Thirty full-canvas steps take about 197 MB, and the step limit keeps many tiny steps from piling up.

### Activities

- **Items are found by file convention, not by a central list.** Parallel branches merge without conflicts.
- **Three activity kinds: rounds, sequence, and free.** The typing course, the shortcut workshop, and the robot tiers are authored sequences, not generated rounds.
- **Robot painter is one sequence activity per tier plus a free mode.** Each puzzle is a step with a unit-tested reference solution.
- **Each toy desktop lesson is its own activity.**
- **A session of a rounds activity ends on a calm finish screen with two equal choices**, play again or go back. A neutral choice is not a prompt to keep playing.
- **Strings have no interpolation.** Sentences are composed from clips, so letters and numbers sound the same everywhere.
- **Strings are spoken by default.** A silent string must say why.

### Assets

- **Voice is Kokoro-82M version 1.0.** Its model card states Apache-2.0 and training on permissive data. Checked 2026-11-13.
- **Voice clips are named by a hash of the voice profile and the text.** A changed string has no clip until one is generated, so the check fails without a manifest to keep in sync.
- **Sound effects are synthesized at runtime with the Web Audio API.** They are original work and add no files.
- **Stamps and activity art use the Fluent Emoji "Color" SVG style**, a curated subset. The upstream LICENSE file is MIT. Checked 2026-11-13.

### Process

- **The single pull request opens as a draft once the foundation exists**, so the macOS and Windows installer jobs run early.
- **The coordinator generates voice clips on the integration branch.** Feature branches do not run the speech model.
