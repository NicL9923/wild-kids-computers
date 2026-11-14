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

### Paint

- **The paint engine is a software rasterizer in TypeScript over typed arrays.** It removes the GPU and the font stack from image tests, so the same pixels come out on every machine and tests compare exactly.
- **The engine has its own trigonometry and power functions.** The built-in ones can differ in the last bit between builds of V8.
- **The canvas is 1600 by 1000 pixels.**
- **Every paint tool has a sticky pen.** A click puts the pen down and the next click lifts it. Hard rule 7 requires a click alternative to every drag, and a 3-year-old on a trackpad cannot hold a drag.
- **Undo copies 64 px tiles on first touch.** Thirty full-canvas steps cost about 192 MB at worst, which fits under the cap.
- **Whole-picture effects run in a Web Worker.** A measured kaleidoscope took 100 ms and a blur 200 ms on a fast laptop CPU, which would freeze a slow one.
- **The text tool fills glyph outlines from a table built at build time.** The app ships no font parser.

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
