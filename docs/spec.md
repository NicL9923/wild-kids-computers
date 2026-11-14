# Wild Kids - Computers product spec

Spec version 0.1, written 2026-11-13. Milestone 1 covers everything in this file except the section "Out of scope for milestone 1".

The evidence behind the design rules is in [Research notes](research.md).

## Product

Wild Kids - Computers is a free desktop app where children aged 3 to 12 learn to use a computer by playing and painting. It runs offline on macOS, Windows, and Linux. It is the first title in the Wild Kids line from Wild Flowers Tech.

The app continues the idea behind GCompris and Tux Paint with a current look and one consistent design. The license is MIT. The app has no price, ads, purchases, accounts, or telemetry.

The first user is a 3-year-old who is starting to use a laptop. When two requirements compete, the youngest band wins.

## Hard rules

Add an automated check for each rule where a check is possible.

1. **No network.** The app makes no network request of any kind, and it has no auto-update. The main process cancels every request that does not load a bundled file. The renderer has a content security policy that allows only bundled content. Navigation and new windows are blocked. A test proves that a request to an outside address fails. A CI check fails when a dependency for HTTP clients, analytics, crash reporting, or updates appears.
2. **Original work only.** Copy no code, art, sound, text, or names from GCompris, which is AGPL-3.0, or from Tux Paint, which is GPL. Similar game mechanics are fine.
3. **Every asset has a license entry.** Each file under `assets/` has an entry in a license manifest with its source, author, and license. The build fails when an asset has no entry. Allowed licenses are MIT, Apache-2.0, CC0, CC BY 4.0, and OFL for fonts. Do not use ShareAlike or NonCommercial assets.
4. **No manipulative design.** The child never sees stars, points, badges, streaks, leaderboards, countdown clocks, or prompts to keep playing. No character nags or shows disappointment.
5. **Every instruction is spoken.** No activity for ages 3 to 5 requires reading. Each instruction has a replay control.
6. **One learning goal per activity.** The goal is written in the activity definition. Remove animation and sound that do not serve the goal or give feedback on the child's action.
7. **Click before drag.** Every drag has a click-to-pick-up, click-to-place alternative. Double-click and right-click appear only in activities that teach them.
8. **The renderer has no Node access.** Context isolation and the sandbox stay on. The renderer reaches the system through one typed bridge.

## Age bands

The first launch asks for an age band. A parent can change it in the parent corner. Each kid profile has its own band.

| Band | Ages | Smallest target | Look |
| --- | --- | --- | --- |
| `band-3-5` | 3 to 5 | 72 CSS px | Fewest choices on screen, largest art, no text needed |
| `band-6-8` | 6 to 8 | 56 CSS px | Short text with speech, more tools |
| `band-9-12` | 9 to 12 | 44 CSS px | Plainer look, full tools, text instructions with speech on request |

The target sizes are starting estimates. No study gives a validated minimum for each age. Keep each size in one token so that testing with children can change it in one place.

Each activity declares which bands it serves. The band sets which activities appear, the difficulty range, and the look.

## Shell

- **First launch.** A setup flow for a parent and child together: create a profile, choose an age band, check that sound works, and choose whether to turn on kiosk lock. Every step is spoken.
- **Profiles.** Several children can share one computer. A profile has an animal avatar, a color, an age band, progress, settings, and a gallery. A name is optional.
- **Home map.** One picture of a wildflower meadow. Each area of the app is a place on the map. Every activity is at most two clicks from the map.
- **Parent corner.** A gate protects it. By default the gate shows three digits written as words and asks the adult to type them. A parent can set a PIN to replace the default gate. The parent corner holds profiles, age band, volume for voice and for effects, text size and letter spacing, reduced motion, kiosk lock, session length, picture export, and a view of the skills each child has practiced.
- **Kiosk lock.** The app runs fullscreen and asks for the parent gate before it quits. The lock is best effort. The operating system keeps its own shortcuts.
- **Session length.** Off by default. When a parent sets a length and the time is up, the app lets the current round finish and then shows a calm closing screen. The child never sees a clock.
- **Progress.** The app adjusts difficulty up and down from recent results. The parent view lists skills practiced in plain words. It shows no scores.

## Areas

Activity names are working titles. The counts are targets. Adjust a count when quality needs it and record the reason.

### Paint studio

A fixed-size canvas with a 16:10 shape, scaled to fit the window.

- **Tools.** Brush with about 12 tips that include rainbow and pattern tips, eraser, line, shapes with fill and outline options, fill bucket with solid, gradient, and pattern fills, text, and stamps.
- **Stamps.** A browsable library by category. A stamp can be resized, flipped, and rotated before it is placed.
- **Effects.** About 40 effects in four groups: distort, color, paint-on effects such as glitter and confetti, and whole-picture effects such as mirror and kaleidoscope.
- **Coloring pages.** About 30 original line drawings. Fill respects the lines.
- **Undo.** At least 30 steps of undo and redo. "Start over" is itself undoable.
- **Gallery.** The studio saves pictures on its own, with no file dialog. The gallery shows thumbnails. A child can open, copy, and delete a picture. Delete can be undone.
- **Export and print.** Both sit behind the parent gate by default.
- **Sound.** Each tool has a short sound that follows the child's action. A mute control is always visible.
- **Bands.** `band-3-5` sees brush, stamps, fill, eraser, and a short list of effects. Older bands see every tool.

### Computer skills

About 20 activities. The pointer activities follow the order move, click, drag, double-click, right-click, scroll.

| Activity | The child | Bands |
| --- | --- | --- |
| Wake the meadow | Moves the pointer and flowers bloom under it | 3-5 |
| Follow the trail | Keeps the pointer on a winding path | 3-5, 6-8 |
| Pop the seed pods | Clicks large still targets | 3-5 |
| Catch the fireflies | Clicks moving targets | 3-5, 6-8 |
| Pack the picnic | Drags items to places, or clicks to pick up and clicks to place | 3-5, 6-8 |
| Knock knock | Double-clicks doors to open them | 6-8 |
| Two buttons | Sorts things with left click and right click | 6-8, 9-12 |
| Climb the tall tree | Scrolls a tall scene to find things | 6-8 |
| Zoom explorer | Zooms in and out to find small things | 6-8, 9-12 |
| Sliders and dials | Drags sliders to match a target | 6-8 |
| Trackpad moves | Practices two-finger scroll and tap | 6-8, 9-12 |
| Any key party | Presses any key and sees a result | 3-5 |
| Find the key | Presses the letter that is shown and spoken | 3-5, 6-8 |
| Arrow key maze | Steers a critter with the arrow keys | 3-5, 6-8 |
| Space and Enter | Jumps with Space and confirms with Enter | 3-5, 6-8 |
| Type the word | Types short words shown with a picture | 6-8 |
| Big letters | Uses Shift for capitals and symbols | 6-8, 9-12 |
| Fix the sentence | Uses Backspace, Delete, arrow keys, and text selection | 6-8, 9-12 |
| Typing course | Learns touch typing from the home row, accuracy before speed | 9-12 |
| Shortcut workshop | Uses copy, cut, paste, undo, select all, and save | 9-12 |

Shortcut lessons show the modifier key of the current operating system.

### Toy desktop

A pretend computer inside the app. It never touches real files. It has a free-play mode with small toy apps: a notepad, a picture viewer, a file explorer, a music box, and a calculator.

| Lesson | The child | Bands |
| --- | --- | --- |
| Open and close | Opens and closes windows | 3-5, 6-8 |
| Move and resize | Moves and resizes windows | 6-8, 9-12 |
| Switch windows | Minimizes, maximizes, and switches between windows | 6-8, 9-12 |
| Menus | Finds a command in a menu | 6-8, 9-12 |
| Files and folders | Opens folders, moves a file, makes and renames a folder | 6-8, 9-12 |
| Trash | Deletes a file and restores it | 6-8, 9-12 |
| Save and open | Saves work with a name and finds it again | 6-8, 9-12 |
| Copy and paste | Moves content between two toy apps | 6-8, 9-12 |
| Undo and redo | Reverses and repeats a change | 6-8, 9-12 |
| Controls | Uses a checkbox, radio button, dropdown, slider, text field, and scrollbar | 6-8, 9-12 |
| Find it | Searches for a file by name | 9-12 |
| Parts of a computer | Names the screen, keyboard, mouse, trackpad, speaker, and camera | 3-5, 6-8 |
| Fix it | Solves simple problems such as muted sound or a hidden window | 6-8, 9-12 |
| Secrets stay secret | Makes a strong toy password and sorts private from shareable facts | 6-8, 9-12 |

### Early learning

About 30 activities. Each one scales its difficulty within the bands it serves.

- **Letters and reading.** Letter sounds, find the letter, first sound of a pictured word, alphabet order, rhyming pairs, build the word, sight words, missing letter, sentence builder.
- **Numbers and math.** Count the flowers, match numeral to quantity, more or fewer, number line, add and subtract with objects, make ten, skip counting, times tables, fractions.
- **Shapes, colors, and space.** Color match, shape sorter, big and small, shape builder, mirror symmetry.
- **Memory and logic.** Memory pairs, what comes next, odd one out, jigsaw puzzles that can use gallery pictures, picture sudoku, sliding puzzle, mazes.
- **World.** Tell the time, days and months, animal homes.

### Robot painter

Coding puzzles where blocks drive a small robot that draws on a canvas. About 30 puzzles and a free mode.

- **Tier 1 for `band-3-5`.** Arrow blocks move the robot one step at once, then in sequences of two to four blocks. Blocks are pictures.
- **Tier 2 for `band-6-8`.** Longer sequences, repeat blocks, pen up and pen down, colors, and puzzles where the child finds the wrong block.
- **Tier 3 for `band-9-12`.** Nested repeats, turns by angle, and blocks the child defines.

A drawing from the robot can go to the paint studio as a starting picture.

## Assets

- **Art.** Stamps and activity art come from Microsoft Fluent Emoji, which its repository lists as MIT. The home map, avatars, coloring pages, and interface art are original SVG.
- **Sound effects.** CC0 sources or original.
- **Voice.** English only in milestone 1. Generate clips at build time with an open text-to-speech model and commit them. Kokoro-82M is the first choice. Confirm on its model card that the license covers this use before you generate anything. A check fails when a spoken string has no clip or when the text of a string changed after its clip was made.
- **Text.** Every string lives in a catalog with typed keys. A check fails on a missing key.
- **Fonts.** Bundle fonts under OFL. Choose a face with clear single-story letter shapes for early readers.

## Architecture

- **Stack.** Electron, TypeScript with `strict`, React 19, Vite, Tailwind CSS v4, Vitest, Playwright, Oxlint, Oxfmt, and npm on Node. Verify every version before you pin it.
- **Settled defaults.** Radix primitives for parent-corner dialogs. camelCase module names. TanStack Router. Zod for saved data. No error tracking, because the app has no network.
- **Core modules have no interface code.** The paint engine and the activity kit import nothing from React or Electron. Tests run them without the app.
- **Paint engine.** Tools and effects are separate modules behind one interface each, listed in a registry. Undo stores changed regions with a memory cap. Pointer input uses coalesced events for smooth strokes.
- **Activity kit.** One definition per activity: id, area, bands, learning goal, input needs, a level generator that is a pure function of a seed and a difficulty, spoken strings, and a component. The kit supplies the instruction player, feedback, difficulty adjustment, exit control, and a scope that cancels timers and audio when the child leaves.
- **Platform bridge.** One typed interface for storage, window control, export, and print. The Electron build implements it over IPC. A browser build implements it over browser storage. The same contract tests run against both.
- **Storage.** Profiles, progress, and settings are versioned JSON validated with Zod. Pictures are PNG files with thumbnails. A corrupt file is set aside and replaced with defaults. The app never crashes on bad saved data.
- **Browser build.** The renderer also builds as a static site. CI proves that it builds and loads. Do not host it publicly.

## Accessibility

- Every screen works with the keyboard alone, with visible focus. Activities that teach the pointer are the exception.
- A reduced-motion setting follows the operating system preference by default.
- Text size and letter spacing are adjustable. Do not ship a special dyslexia font as the default.
- Color is never the only signal.
- An automated accessibility scan runs on every screen in the end-to-end tests. Target WCAG 2.2 AA.

## Quality

- **Paint tests.** Each tool and effect has an image comparison test. The comparison must give the same result on a developer machine and in CI. State the method in `AGENTS.md`.
- **Activity tests.** Level generators have unit tests with a fixed seed and a pinned clock. Each activity has one end-to-end test that completes a round with real input events and asserts a result the child would notice.
- **Registry test.** One test lists every activity and fails when a definition lacks a goal, bands, spoken strings, or its end-to-end test.
- **Guards.** Each validation guard has a test that feeds it the bad input it rejects, such as corrupt saved data.
- **Time.** Activities that depend on the local clock also run under a timezone east of UTC.
- **Mutation testing.** Run a mutation tool on the paint engine math, the level generators, the difficulty model, and storage validation.
- **Performance targets on a 1920 by 1080 window.** A brush stroke keeps up with the display refresh rate. A full-canvas fill finishes in under 100 ms. Memory stays flat during 5 minutes of continuous strokes. The home map appears within 3 seconds of launch. These are targets, not measurements. Report measured numbers with the machine that produced them.
- **CI.** One workflow with change detection. It lints, type checks, and runs unit and end-to-end tests on Linux. It builds unsigned installers on macOS, Windows, and Linux. Pin actions by commit SHA.

### Definition of done for an activity

1. The definition states one learning goal and the bands it serves.
2. Every instruction has a voice clip and a replay control.
3. The activity uses nothing from hard rule 4.
4. The activity cancels its timers and audio when the child leaves.
5. The unit tests and the end-to-end test pass.
6. A screenshot at each band it serves has been reviewed.

## Out of scope for milestone 1

- Code signing and notarization
- Public hosting of the browser build
- Languages other than English
- Store listings, tags, and GitHub Releases
- Teacher or classroom tools
- Sync between computers

## Open items for Nicolas

- Test with a 3-year-old. The target sizes and the youngest band are untested until then.
- Review the art direction and the voice.
- Decide on signing. Unsigned installers trigger operating system warnings.
- Run a USPTO search for "Wild Kids" in classes 9, 41, and 42 before the line grows.
