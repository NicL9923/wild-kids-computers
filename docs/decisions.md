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
- **The difficulty model moves one level at a time:** up after two clean rounds at the current level, down right after a round with three or more mistakes and hints. Each saved round records its level, an optional field, so a raise never counts rounds from the level before. A bad saved level is dropped, not a reason to reset progress.
- **The kit counts mistakes and hints itself.** `kit.feedback.wrong` and `kit.hint` count, and `kit.roundComplete()` uses the counts, so an activity cannot forget to report them.
- **A click on empty ground in a pointer activity is a quiet mistake:** a ring where the click landed, no sound, and it counts toward easing the level.
- **Between rounds the stage rests for 1.2 seconds and takes no input.** The child sees the last action land, and the session limit is checked then.
- **A sequence shows only the steps reached.** Nothing looks locked.
- **Pop the seed pods draws original seed heads,** not an emoji: no bundled emoji reads as a seed pod. Pods are at least 160 board units, about twice the youngest band's target, and never near the exit corner.
- **Count the flowers lets a child touch each flower to count it out loud.** Counting is the goal, so the aid serves it. Rows hold at most five, like a ten frame, and distractors are within two of the answer.
- **Find the letter and sight words keep their choices quiet under the pointer.** Knowing a written letter or word is the goal, so a choice that said its name on hover would turn the round into listening for a match. A wrong pick says its own name instead, so every try still teaches. Other letter choices speak on hover and focus: names where the goal is a sound or an order, and sounds where the goal is spelling.
- **An instruction line can show less than the voice says.** `setInstruction` takes `shown`, so "Which letter makes this sound?" shows without the letter that would give the answer away from band-6-8 up.
- **Letters that say the same sound never share a round.** c and k share the shared clip "kuh", and q starts with it, so a sound or a spelling round never offers two of them.
- **Sight words, missing letter, and sentence builder start at band-6-8.** Each needs the child to read written words, which hard rule 5 keeps away from the youngest. First sound and build the word with its letter guide cover the same ground for them.
- **Rhyme sets are true rhymes in General American English, checked by ear.** Pairs that share only a vowel, such as goat and nose, meet only at higher difficulty, and near rhymes are left out.

### Assets

- **Voice is Kokoro-82M version 1.0.** Its model card states Apache-2.0 and training on permissive data. Checked 2026-11-13.
- **Voice clips are named by a hash of the voice profile and the text.** A changed string has no clip until one is generated, so the check fails without a manifest to keep in sync.
- **Sound effects are synthesized at runtime with the Web Audio API.** They are original work and add no files.
- **Stamps and activity art use the Fluent Emoji "Color" SVG style**, a curated subset. The upstream LICENSE file is MIT. Checked 2026-11-13.
- **Coloring pages ship as PNG masks rendered from SVG sources, not as SVG.** The mask is the same pixels on every machine, and Node tests fill the exact pixels the app uses. A four-bit palette with sixteen alpha levels keeps all 30 masks under 800 KB.
- **A mask records the hash of its source.** A stale mask fails a test without a separate manifest to keep in step.
- **The picker thumbnail is the SVG source.** It scales cleanly to any size and adds no files. Masks and thumbnails are imported with `?no-inline`, so they stay out of the JavaScript bundle.
- **Coloring page bands:** a `band-3-5` page also appears for `band-6-8`, and a `band-6-8` page also appears for `band-9-12`. Simpler pages are no harm to an older child. Harder pages frustrate a younger one.
- **Coloring page size rules by youngest band:** 4 to 8 regions at least 90 px across with lines at least 10 px for `band-3-5`, 10 to 20 regions at least 30 px across with lines at least 6.5 px for `band-6-8`, and 20 to 40 regions at least 16 px across with lines at least 4.5 px for `band-9-12`. "Across" is the widest disc that fits in the region. The drawings use 14, 9, and 6 px lines.
- **Scenes for `band-9-12` sit inside a rounded frame.** Every page then has exactly one paper region at the page edge, which the fill test checks.

### Strings, voice, and audio

- **The voice is Kokoro `af_bella` at speed 0.9.** On short words `af_heart` added a trailing vowel that two recognizers heard ("bee" as "B.A.", "cat" as "hot"). `af_bella` decoded the same words cleanly. 0.9 is unhurried without sounding slowed.
- **Every clip is generated after a lead-in and cut at the pause.** Kokoro adds a false consonant to a short utterance that starts with a vowel ("egg" came out "lag", "eight" "wait"). After a lead-in it does not. "Ready?" gave the longest, steadiest pause of six leads tried before words. "Say." and an empty sentence gave cleaner onsets before bare sounds. The cut fails loudly when the pause is missing.
- **The generator phonemizes text itself and maps espeak phonemes to misaki's.** Kokoro v1.0 was trained on misaki phonemes, which write each diphthong and affricate as one symbol. kokoro-js passes espeak's two-symbol forms, and the model said "boy" as "bye" and "eighty" as "eirei". The mapping matches Kokoro's own Python pipeline and fixed those words with no regression in a control set.
- **Every speech is synthesized with end punctuation.** Without a final period, Kokoro clipped the last sound of short words: "bed" was heard as "bad", "worm" as "wham".
- **Letter sounds are Kokoro phonemes between slashes.** As text, "mmm" reaches the model as "em em em". Stops carry a light schwa ("buh"), because the model cannot release a stop alone. A person should still listen to them; see docs/voice-round-trip.md.
- **Clips are mono Opus at 24 kbit/s in voice mode, evened to -20 dBFS voiced RMS.** Speech stays clear and a word is about 3 KB.
- **The round trip runs Whisper large-v3-turbo and a wav2vec2 phoneme recognizer** in a Python environment outside the repository. Whisper hallucinates on clips under half a second, so letter sounds use the phoneme recognizer.
- **The voice and emoji tools have their own `package.json` files** in `tools/voice` and `tools/emoji`. Their packages never enter the app's dependency tree or license check.
- **`check:voice` and `voice:generate` run as Vitest tasks under `tools/tasks/`**, not in `npm test`, because a feature branch adds strings before its clips exist.
- **The content rules go beyond the spec's list** to pressure words (hurry, one more) and scolding words (wrong, oh no, sad). An honest use opts in per string.
- **Sound effect names are one typed list** in `src/audio/sfx/sfxNames.ts`. A typo in `play('pop')` is then a compile error. The list is short and the audio layer owns it, so it is an exception to discovery by file.
- **Generated clips are licensed MIT**, like the rest of the project's own work. The model's Apache-2.0 license covers the model, not its output.

### Emoji

- **401 emoji in 12 categories.** People use the upstream "Default" tone, which is not a human skin color. Flags, alcohol, weapons, tobacco, religious symbols, scary pictures, reward symbols, and timers are left out.
- **SVGO's default preset optimizes each file only when a 256 px render matches the original.** That saved 28 percent. The worst file changed 0.4 percent of pixel values, all on anti-aliased edges.

### App shell

- **First launch saves the profile after the age band step**, then checks sound and offers kiosk lock. A parent who closes the app after that comes back to the sound check with the profile kept. When profiles exist but setup is not done, first launch asks only about sound and kiosk lock.
- **First launch and the profile choice always use the youngest band's look.** Before a child is chosen, the person at the computer may be three.
- **With several profiles, every launch shows the profile choice**, even when a child was active last time, because another child may be at the computer. With one profile the app goes straight to the meadow, and the meadow hides the "change player" control.
- **The word gate keeps its digits through wrong answers and draws new ones each time it opens.** A typo does not cost the adult a new puzzle. Digits come from `crypto.getRandomValues` with rejection sampling, so each is equally likely.
- **A wrong gate answer waits 1, 2, 4, then at most 8 seconds** before the next try. It slows guessing and never locks a parent out.
- **The parent corner asks the gate every time it opens**, however the adult got there, and uses the oldest band's denser look with standard text. The child's text size and spacing show in a preview instead of resizing the corner.
- **The parent corner edits one child's settings at a time**, and choosing a child there makes that child active. The session holds one profile's settings, and loading every profile's settings for one screen would duplicate the session's write rules.
- **A forgotten PIN is removed by deleting `app.json`.** A missing or corrupt `app.json` already falls back to defaults without touching profiles, so the reset needs no extra code path a child could reach. The README and the gate's "Forgot the PIN?" link give the steps and the folder.
- **"A little more time" on the closing screen is ten minutes**, added to the limit in the session store so every feature's check agrees. It lasts until the profile changes or the app restarts.
- **The shell checks the session limit on every change of screen**, besides the activity kit's check between rounds and the paint studio's check when the pen is up. The back button then cannot leave the closing screen. The closing screen and the parent corner stay open.
- **Session length choices are off, 15, 30, 45, 60, and 90 minutes.**
- **The grown-ups' control sits alone in the bottom right corner** of the meadow and the closing screen, away from the places and the child's top bar.
- **`index.html` declares the cascade layer order** before any stylesheet. A CSS chunk that the first screen imports can load ahead of the Tailwind entry, and its `@layer components` would then lose to Tailwind's base reset. A unit test keeps the statement in step with Tailwind.

### Process

- **The single pull request opens as a draft once the foundation exists**, so the macOS and Windows installer jobs run early.
- **The coordinator generates voice clips on the integration branch.** Feature branches do not run the speech model.
