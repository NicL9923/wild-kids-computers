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
- **Known limit: on Linux, text selected in the app may reach the X primary selection,** which a middle click pastes into other programs. Chromium writes that buffer itself when a selection changes, no Chromium switch turns it off, and the renderer cannot reach it. Clearing it from the main process would need a polling timer and would also wipe what an adult selected in another program. A probe under Xvfb with Playwright's input, which bypasses the X server, selected text by keyboard and by double-click and left the primary selection unchanged, so no fix could be verified in CI. The exposure is a child's own words in the app, never adult data, and the system clipboard stays untouched. Checked 2026-11-14.
- **Root guards also cancel `dragover` and `drop`**, so text or files dropped from another program cannot carry system data in. Every drag in the app uses `useCarry`, so nothing needs native drops.
- **A close request that gets no answer within 3 seconds destroys the window.** A plain close waits for the page's unload handlers, which a hung page never finishes. A test measured 39 seconds with a plain close.
- **Ctrl or Command plus W reaches the page.** The toy desktop teaches it as Close, a convention of real computers. The application menu has no close accelerator, so the key never closes the app window, and every other close goes through a close request. Blocking it left the toy menu promising a key that did nothing.
- **Every window close goes to the renderer as a close request, with or without kiosk lock.** Without kiosk lock the renderer saves unsaved work and quits with no parent gate. Holding the close with `beforeunload` alone lost work, because Chromium ignores a cancelled unload on a page the user never clicked.
- **The renderer must answer a close request explicitly.** The preload does not answer for it, because a renderer that is alive but showing an error screen would then trap the child behind a gate that never appears.
- **The main process stops the file chooser through Chromium's DevTools protocol.** Electron 45.3.2 has no setting, event, or switch for the chooser `<input type="file">` opens, and a click guard in the page cannot see a file input in a closed shadow root or a `showPicker()` call. Each web contents gets `webContents.debugger` with `Page.enable` and `Page.setInterceptFileChooserDialog` with `cancel`. The session runs inside the app and opens no debugging port. A probe showed interception does nothing without `Page.enable`, that the commands can be sent before the first load, and that the block survives a reload and a renderer crash.
- **The preload uses `contextBridge.executeInMainWorld`, which Electron marks experimental,** to make `showPicker()` refuse on a file input before page scripts run. It is a second layer behind the main process, so an Electron change to it cannot reopen the chooser.
- **A paste that carries a file from another program becomes an empty paste.** Dropping it would also drop the child's toy clipboard paste whenever an adult had copied a file in the file manager, which would stall the copy and paste lesson. The app never reads the event's data, so an empty paste behaves the same.
- **A Bluetooth device request is cancelled in the main process.** Electron answers `select-bluetooth-device` with the first device in range when nothing handles it. Linux builds have no Web Bluetooth, so only macOS and Windows reach the handler.
- **Known limit: the file store narrows, but does not close, a race with another program that swaps a folder in the data directory for a link.** The store refuses links below the data directory, and right before each read, write, rename, or removal it confirms the folder's real path is still its own place under the data directory, which was fixed at the store's first check. A program that swaps the folder in the instant between that confirmation and the call can still redirect it. Closing that gap needs every call anchored to an open directory handle (`openat` with `O_NOFOLLOW` on each part), which Node does not offer and Windows does not have in that form. The program that could do the swap already runs as the same user and can read and change every file the app can, including the data directory itself, so the app cannot protect anything from it; the check exists so a link left by a backup restore or a sync tool is refused rather than followed. The renderer cannot make a link or choose a path. Checked against Node 24.22.2, 2026-11-14.
- **Test runs reach the bridge through `window.wkcTest.bridge`.** The contract suite then exercises the exact object the app uses, in both builds.

### Storage

- **Saved data lives in `<userData>/data/`**, away from the files Chromium keeps in the user data directory.
- **One app instance per user data directory.** The main process takes Electron's single-instance lock before it opens storage, and a second launch brings the first window forward and exits. The file store assumes it is the only writer: two instances saving one picture shared staging names, and a probe left a mismatched picture and thumbnail that recovery kept. A probe on Electron 45.3.2 confirmed that Chromium keys the lock on the user data path, so the end-to-end tests, each with its own directory, still run side by side.
- **The bridge adds `documents.removeProfile`**, because deleting a profile must remove activity documents whose names the parent corner cannot list.
- **Pictures have no index file.** The gallery lists the PNG files and sorts by modification time, so there is no index to fall out of step.
- **Bad saved data and a future version are both set aside.** A newer app's document stays on disk under the `.corrupt-<timestamp>` name, so a parent can recover it after updating again.
- **The parent PIN is 4 to 8 digits, hashed with PBKDF2-SHA256 at 600,000 iterations and a 16-byte salt.** That is OWASP's current minimum. The record stores the iteration count, so a later build can raise it. A short PIN stays guessable by anyone who can read the file; the hash only keeps it from being read in plain text.
- **A parent PIN record the gate cannot verify is corrupt saved data.** The schema accepts only the exact base64 of a 16-byte salt and a 32-byte hash, so a damaged record sets the whole `app.json` aside like any other corrupt document, and the app falls back to the word gate and the first-launch sound and kiosk steps. If checking a PIN still fails at run time, the open gate switches to the word gate with a note. Refusing every answer instead would lock the adult out of the parent corner and, under kiosk lock, out of quitting. A child cannot damage the file or make Web Crypto fail, so the fallback opens nothing a child can reach.
- **Settings defaults:** voice volume 1, effects volume 0.6, not muted, standard text size and letter spacing, reduced motion follows the system, no session limit, and export and print behind the parent gate.

### Paint

- **The studio never lets go of a picture it has not saved.** Every way out, a route change, new paper, a coloring page, or quitting, saves first, the stroke in progress included. When the save fails, the picture stays on screen and the studio says, in speech and on screen, that it could not be saved yet and to get a grown-up. The child stays in the studio until it saves, even past the session length, because a child's picture is worth more than leaving on time. Quitting is different: it stays open once to say so, and the next close goes through, so a full disk never traps the app.
- **Quitting waits at most 5 seconds for unsaved work.** Encoding and saving a picture takes well under a second, so the wait covers a slow machine, and a hung save cannot keep the app open.
- **Every request to the picture worker has a deadline: 10 seconds to start, 5 for an effect, 10 to encode, and 10 more to encode on the main thread after the worker failed.** `npm run perf` on an i9-14900HX measured 15 ms to start, 252 ms for the slowest effect, and 578 ms to encode a picture of pure noise, the hardest case for PNG, so each deadline is at least 15 times the slowest round trip. A worker that misses one is stopped and replaced on the next request; after three in a row, the studio stays on the main thread. A worker that crashes is not started again.
- **Picture calls to the main process from the studio and the gallery end after 10 seconds** and count as a failed disk. The call may still land later. A new picture gets its id in the studio, 32 random hex digits from `crypto.getRandomValues`, before its first save, and every try sends it. Both bridges treat a save under an id as create or overwrite, so a retry after a save that landed late replaces it instead of leaving a second copy. A save under the id of a trashed picture still fails with `not-found`, so it never brings back a picture beside its trashed twin.
- **Undo, redo, start over, and painting wait while a whole-picture effect works,** and the picture dims under a sparkles picture that pulses unless motion is reduced. A result for a picture that changed meanwhile is dropped.

- **The paint engine is a software rasterizer in TypeScript over typed arrays.** It removes the GPU and the font stack from image tests, so the same pixels come out on every machine and tests compare exactly.
- **The engine has its own trigonometry and power functions.** The built-in ones can differ in the last bit between builds of V8.
- **The canvas is 1600 by 1000 pixels.**
- **Every paint tool has a sticky pen.** A click puts the pen down and the next click lifts it. Hard rule 7 requires a click alternative to every drag, and a 3-year-old on a trackpad cannot hold a drag.
- **Undo copies 64 px tiles on first touch.** Thirty full-canvas steps cost about 192 MB at worst, which fits under the cap.
- **Whole-picture effects run in a Web Worker.** A measured kaleidoscope took 100 ms and a blur 200 ms on a fast laptop CPU, which would freeze a slow one.
- **The autosave PNG encoding runs in the same worker.** On the main thread it delayed a fill that landed during a save. `npm run perf` on an i9-14900HX under Xvfb measured fill click to pixels at a median of 43.3 ms and a p95 of 87.2 ms before, and 26.1 ms and 55.3 ms after. The studio copies the pixels before it hands them over, so painting goes on during the encode.
- **The text tool fills glyph outlines from a table built at build time.** The app ships no font parser.
- **The paint text face is Andika Bold 7.000, shipped as the glyph table "Meadow Sans".** Bold strokes read better on a painting. "Andika" is a Reserved Font Name under the OFL, and a subset table is a modified version, so it takes another name.
- **Within one stroke, a pixel keeps the highest coverage any dab gave it.** Overlapping dabs never darken each other, so a see-through marker stays even and a soft brush shows no beads.
- **Outlines and lines are stroked by distance to the polyline, not by filling overlapping pieces.** Summing the coverage of overlapping pieces doubles their antialiased edges.
- **The fill bucket grows one pixel under line art and unmixes antialiased painted edges.** Neither leaves a pale fringe between the paint and a line.
- **A change that left every pixel as it was adds no undo step.** A fill in the color already there, or a stamp with no visible pixels, does not cost the child an undo.
- **The undo cap is 256 MiB and at most 100 steps.** Thirty full-canvas steps take about 197 MB, and the step limit keeps many tiny steps from piling up.
- **The effects tool is called "Effects", not "Magic".** Tux Paint calls its effects tools "Magic", so hard rule 2 rules the name out. The strings and file name scans flag "magic"; only the magic wand stamp, a real object, allows it. The tool's picture is sparkles, not the wand.

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
- **Free play ends the session at a calm moment, not mid-action.** Robot free draw checks after a direct move or a finished program and holds the check during a run, even one paused by "one step". Toy desktop free play checks after a change is saved, unless the change was typing, and holds the check while a save or open dialog or a rename is open. A carried item holds it in any free activity. The shell also checks after 20 seconds with no input, so a free activity that forgets a checkpoint still ends; 20 seconds lets a child who stops to think keep going. When the limit is reached the stage rests for the same 1.2 seconds as between rounds, so the child sees the last action land. The toy desktop saves before the closing screen; a robot free drawing is not saved, as when the child leaves by the exit control.
- **Between rounds the stage rests for 1.2 seconds and takes no input, and the next round also waits for the speech in progress to end.** The child sees the last action land and hears the whole sentence about it, such as "four plus six equals ten", before a new instruction starts. The session limit is checked then.
- **A sequence shows only the steps reached.** Nothing looks locked.
- **No toy desktop lesson can get stuck.** Without a close button, Close also leaves the menus and shortcuts, and a window the child opens during a round always has a close button. A step whose needed thing the child destroyed, such as the number to copy or the folder to move a file into, puts the desktop back as the step began and says the step again, with no try counted. A random-walk test checks every lesson for a way to finish.
- **For the youngest band, an app icon brings the app's open window forward.** Every window fills the screen there, so a second window of the same app would hide the first exactly, and closing one would show another just like it.
- **In the trash lesson, a picture inside a folder that went in the trash counts as deleted**, as on a real computer, and restoring the folder restores it.
- **Find it hides Rename.** A renamed file no longer answers to the name the child hears, and renaming is not the lesson.
- **A save or open dialog answers for its window.** The document under it takes no typing or clicks, and the keyboard moves into the dialog however it opened.
- **Text marked `data-no-copy` is never copied.** The pretend password in Secrets stay secret cannot reach the toy clipboard, even through Select all.
- **Pop the seed pods draws original seed heads,** not an emoji: no bundled emoji reads as a seed pod. Pods are at least 160 board units, about twice the youngest band's target, and never near the exit corner.
- **Count the flowers lets a child touch each flower to count it out loud.** Counting is the goal, so the aid serves it. Rows hold at most five, like a ten frame, and distractors are within two of the answer.
- **Find the letter and sight words keep their choices quiet under the pointer.** Knowing a written letter or word is the goal, so a choice that said its name on hover would turn the round into listening for a match. A wrong pick says its own name instead, so every try still teaches. Other letter choices speak on hover and focus: names where the goal is a sound or an order, and sounds where the goal is spelling.
- **An instruction line can show less than the voice says.** `setInstruction` takes `shown`, so "Which letter makes this sound?" shows without the letter that would give the answer away from band-6-8 up.
- **Letters that say the same sound never share a round.** c and k share the shared clip "kuh", and q starts with it, so a sound or a spelling round never offers two of them.
- **Sight words, missing letter, and sentence builder start at band-6-8.** Each needs the child to read written words, which hard rule 5 keeps away from the youngest. First sound and build the word with its letter guide cover the same ground for them.
- **Rhyme sets are true rhymes in General American English, checked by ear.** Pairs that share only a vowel, such as goat and nose, meet only at higher difficulty, and near rhymes are left out.
- **A thing to count is never smaller than the band's target, at 1280 by 800.** Match the numeral shows two groups at band-3-5 and at most three elsewhere, and more or fewer stops at ten things a group, with closer counts making the top levels harder. More groups or more things in a row shrank each thing to about 40 px. The "fits the hardest round" tests measure every thing in the busiest seed.
- **Matching rounds lay items out in any order at all.** Shape sorter, animal homes, and the jigsaw tray once ruled out the order that lines each item up with its target, which left two items always crossed, so a child could succeed by position. A shared test, `expectNoPositionTell`, checks that every item lands on every place across seeds. Big and small order rounds rule out only the row that clicking left to right would solve; ruling out its reverse too left the middle size never in the middle.
- **An activity whose code does not load within 10 seconds, or fails to load, shows a calm try-again screen** with the exit and mute controls, and trying again starts the visit afresh. Any other error in an activity still goes to the router. The same holds for every screen: each loads through `lazyScreen`, and the router's default error screen offers to try again or go back to the meadow, inside the root layout so the quit guard stays up. A load that answers late is dropped until the child tries again, so nothing appears under the screen on its own.
- **The jigsaw gives the gallery 5 seconds to supply a painting**, list, thumbnail decode, and picture read together, then uses the bundled scene. The child waits on an empty stage meanwhile, and the scene is a fair round. A painting that arrives later is dropped, so the picture never changes mid-round.
- **The toy desktop's picture viewer gives a painting 5 seconds to load, then shows its usual empty state with Open a picture.** The child can open a picture again; a frame that stays empty offers nothing to do.
- **The jigsaw uses a painting only when no two of its pieces look alike.** It takes a piece only in its own place, so look-alike pieces would turn a right answer into a mistake. Accepting interchangeable pieces would need the board to track which piece sits where; falling back to the bundled scene keeps the round fair with no new rules.

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
- **Every clip is generated after a lead-in and cut at the earliest pause.** Kokoro adds a false consonant to a short utterance that starts with a vowel ("egg" came out "lag", "eight" "wait"). After a lead-in it does not. "Ready?" gave the longest, steadiest pause of six leads tried before words. "Say." and an empty sentence gave cleaner onsets before bare sounds. The cut takes the earliest pause of 30 ms or more in the window, never a later one, and fails loudly when the pause is missing or when a first pause under 120 ms has a longer pause after it. A click under 30 ms after a short dip joins the break that follows. Trying a 120 ms pause first could skip a shorter break and cut after the first word. An audit of all 1,630 clips on 2026-11-14 found the break 810 to 1300 ms in, at least 50 ms long, and no clip cut anywhere else.
- **The generator phonemizes text itself and maps espeak phonemes to misaki's.** Kokoro v1.0 was trained on misaki phonemes, which write each diphthong and affricate as one symbol. kokoro-js passes espeak's two-symbol forms, and the model said "boy" as "bye" and "eighty" as "eirei". The mapping matches Kokoro's own Python pipeline and fixed those words with no regression in a control set.
- **Every speech is synthesized with end punctuation.** Without a final period, Kokoro clipped the last sound of short words: "bed" was heard as "bad", "worm" as "wham".
- **Letter sounds are Kokoro phonemes between slashes.** As text, "mmm" reaches the model as "em em em". Stops carry a light schwa ("buh"), because the model cannot release a stop alone. A person should still listen to them; see docs/voice-round-trip.md.
- **Clips are mono Opus at 24 kbit/s in voice mode, evened to -20 dBFS voiced RMS.** Speech stays clear and a word is about 3 KB.
- **The round trip runs Whisper large-v3-turbo and a wav2vec2 phoneme recognizer** in a Python environment outside the repository. Whisper hallucinates on clips under half a second, so letter sounds use the phoneme recognizer.
- **The voice and emoji tools have their own `package.json` files** in `tools/voice` and `tools/emoji`. Their packages never enter the app's dependency tree or license check.
- **`check:voice` and `voice:generate` run as Vitest tasks under `tools/tasks/`**, not in `npm test`, because a feature branch adds strings before its clips exist.
- **The content rules go beyond the spec's list** to pressure words (hurry, one more) and scolding words (wrong, oh no, sad). An honest use opts in per string.
- **Sound effect names are one typed list** in `src/audio/sfx/sfxNames.ts`. A typo in `play('pop')` is then a compile error. The list is short and the audio layer owns it, so it is an exception to discovery by file.
- **A voice clip that has not loaded within 5 seconds counts as missing.** Activities wait for speech before the next round, so a stuck load would hold a child on a finished round. A clip is a few kilobytes read from the app's own files, which takes milliseconds.
- **Muting ends speech in progress, and speech asked for while muted plays nothing and resolves at once.** No one hears a muted voice, so waiting out its length before the next round would be a silent pause. The test log still records each string. After unmuting, the replay control speaks the instruction again.
- **Generated clips are licensed MIT**, like the rest of the project's own work. The model's Apache-2.0 license covers the model, not its output.

- **Third-party notices are one generated text file**, built from the license files the dependencies and assets already carry. A package with no license file needs a fallback notice in `tools/notices.ts`, which states the license and holder its package.json names; react-remove-scroll-bar is the one case. Electron and Chromium keep their own notice files, which electron-builder ships beside the program, because the Chromium notices alone are several megabytes.
- **The Kokoro-82M notice lives in `assets/voice/NOTICE.txt`**, one folder above the clips, because `check:voice` allows only clips in `assets/voice/en/`. The clips stay MIT; the notice credits the model and carries its Apache-2.0 text. The model's repository has no NOTICE file, so the attribution names the model, its author, and its model card.

### Emoji

- **401 emoji in 12 categories.** People use the upstream "Default" tone, which is not a human skin color. Flags, alcohol, weapons, tobacco, religious symbols, scary pictures, reward symbols, and timers are left out.
- **SVGO's default preset optimizes each file only when a 256 px render matches the original.** That saved 28 percent. The worst file changed 0.4 percent of pixel values, all on anti-aliased edges.

### Session

- **At startup the session makes the last active profile active again** when it still exists, so a returning child lands on the meadow without choosing. The profile choice still shows when several profiles exist; see "App shell".
- **No profiles means "needs first launch"**, even when `app.json` says setup is done. A household whose last profile was deleted starts again from a profile, not from an empty meadow.
- **Routes are not registered with TanStack Router for path types.** The router tree is found by file convention at run time, which the router's type registration cannot see. Each path has one owner file instead, and a source rule fails on a route literal anywhere else.
- **`recordStep` never moves the furthest step back.** Replaying an early step keeps later ones open, and a step solved but not left still opens the next one.
- **The app counts a bridge that does not say what it is within 5 seconds as no test run**, so a hung bridge cannot keep the window blank before the first screen.
- **`setKioskLock` saves the lock and applies it to the window in one call.** A screen cannot save the choice and forget to apply it, or the reverse. A failed apply becomes the session's save problem.
- **A profile being deleted cannot be made active.** Its files are on their way out, so loading its settings would bring some of them back.
- **Every bridge call the session makes ends after 10 seconds** as an `io` failure, so one call that never answers cannot hold its caller or the start of the app. A document is a small JSON file, so 10 seconds passes only when something is wrong. A timed-out read counts as unreadable for that attempt and sets nothing aside, since the file may be fine.
- **A deadline changes what the child and the adult are told, never the order of operations.** A document write past its deadline shows the save problem at once, but its document's queue stays held until the write really ends, and the document in memory stays the truth until then, also across a profile switch and back. Releasing the queue at the deadline let a later read load the older file while the late write was still on its way, and the next edit then wrote the older value back. The main process also runs a document's reads in the same queue as its writes. Deleting a profile waits at most 10 seconds for its writes and otherwise fails without removing anything, so a late write cannot put a file back after the removal.
- **When the app or profiles document cannot be read at start, by a timeout or any other read failure, the app shows a calm "try again" screen instead of first launch.** Defaults in their place would hide the children's profiles, and the next write would replace the real files. The start screen offers one control to try again; an adult can still close the app. Before this, a read the platform refused fell through to first launch. A corrupt document is still set aside and replaced with defaults, because its data is already lost.

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
- **The shell checks the session limit on every change of screen**, besides the activity kit's check between rounds, free play's checkpoints, and the paint studio's check when the pen is up. The back button then cannot leave the closing screen. The closing screen and the parent corner stay open.
- **Session length choices are off, 15, 30, 45, 60, and 90 minutes.**
- **The grown-ups' control sits alone in the bottom right corner** of the meadow and the closing screen, away from the places and the child's top bar.
- **`index.html` declares the cascade layer order** before any stylesheet. A CSS chunk that the first screen imports can load ahead of the Tailwind entry, and its `@layer components` would then lose to Tailwind's base reset. A unit test keeps the statement in step with Tailwind.

### Process

- **The single pull request opens as a draft once the foundation exists**, so the macOS and Windows installer jobs run early.
- **The coordinator generates voice clips on the integration branch.** Feature branches do not run the speech model.
