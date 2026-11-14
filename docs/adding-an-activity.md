# Adding an activity

Read this with the "Activity kit" section of [architecture.md](architecture.md). Copy the two examples: [pop-the-seed-pods](../src/features/computer-skills/activities/pop-the-seed-pods/) (pointer, one band) and [count-the-flowers](../src/features/early-learning/activities/count-the-flowers/) (choices, two bands, keyboard).

## Files

| File                                                   | Holds                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| `src/features/<area>/activities/<id>/activity.ts`      | `export default defineActivity(...)`                         |
| `.../<id>/level.ts`                                    | `generateLevel`, pure                                        |
| `.../<id>/level.test.ts`                               | Fairness tests with fixed seeds                              |
| `.../<id>/strings.ts`                                  | `defineStrings('<id>', ...)`                                 |
| `.../<id>/<Name>Activity.tsx`                          | The component, default export, plus its own `.css` if needed |
| `e2e/activities/<id>.spec.ts`                          | The one end-to-end spec                                      |
| `assets/art/activities/<id>/*.svg` and `LICENSES.json` | Original art, only if the activity needs it                  |

The id is kebab-case and equals the directory name. Nothing else changes: the registry, the area screen, and `/activity/<id>` find the activity by file name. `activity.ts`, `level.ts`, and `strings.ts` import no React, no `.tsx`, no CSS, no assets, and no registry, so Playwright can import them.

## Skeletons

`strings.ts`. The goal is for parents; everything a child needs is spoken.

```ts
export const strings = defineStrings('pack-the-picnic', {
  title: { text: 'Pack the picnic' },
  goal: { text: 'Moves things to a place by dragging or by click and click.', silent: 'parent' },
  instruction: { text: 'Put the food in the basket.' },
});
```

`activity.ts`, kind `rounds`:

```ts
export default defineActivity<PicnicLevel>({
  id: 'pack-the-picnic',
  area: 'computer-skills',
  order: 50, // position in the area; leave gaps
  bands: ['band-3-5', 'band-6-8'], // youngest first
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'basket' }, // or { art: 'pack-the-picnic/basket' } for assets/art/activities/pack-the-picnic/basket.svg
  kind: 'rounds',
  inputs: ['drag'], // pointer-move, click, drag, double-click, right-click, scroll, zoom, keyboard, text-entry
  difficulty: { 'band-3-5': { min: 1, max: 4 }, 'band-6-8': { min: 3, max: 8 } }, // one range per band served
  roundsPerSession: 4,
  generateLevel, // (seed, difficulty, band) => PicnicLevel
  spoken: [strings.instruction], // the first is the main instruction
  load: () => import('./PackThePicnicActivity.tsx'),
});
```

Kind `sequence`, for authored steps such as a typing course: replace the rounds fields with

```ts
  kind: 'sequence',
  steps: [firstStep, secondStep], // imported explicitly, each with a unique id
  stepsDirectory: '../../puzzles/tier-1', // where step files live, or null for inline steps
  generateLevel: (seed, stepIndex, band) => levelFor(steps[stepIndex]),
```

The registry test fails when a file in `stepsDirectory` is not in `steps`, so a new step cannot be forgotten. The kit saves the furthest step and shows a picker of the steps reached.

Kind `free`, for open play: `kind: 'free'` and `generateLevel: (seed, band) => startingState`. It has no rounds, no finish screen, and `kit.roundComplete` throws.

`defineActivity` throws at import on a missing goal, a silent title, an empty `spoken`, a band without a difficulty range, a range outside 1 to 10, or state defaults its schema rejects. `npm test` imports every definition, so these fail before a child sees them.

## The level generator

`generateLevel` is a pure function of its arguments. Draw everything random from `createRandom(seed)`: `next()`, `int(min, max)` (both ends included), `pick(items)`, `shuffle(items)`, `sample(items, count)`. No clock, no `Math.random` (a lint rule bans it), no shared generator. Put layout in fixed board units, such as 1000 by 600, and let CSS scale the board.

Make every difficulty a small step from the last. Keep targets at least `--wk-target-min` on screen, and keep them away from the top corners, where the exit and mute controls sit.

`level.test.ts` tests properties that make a level solvable and fair, over many seeds, at the lowest and highest difficulty of every band: the answer is offered exactly once, nothing overlaps or leaves the board, targets stay large. Pin tables that are the design, such as the count per difficulty, as literal values in the test, never by reading the table back. Run `npm run mutation` and kill or justify each surviving mutant in your level.

## The component

```tsx
export default function PackThePicnicActivity({ level, band, kit }: ActivityProps<PicnicLevel>) {
  // ...
  kit.feedback.correct({ at: event.currentTarget }); // soft chime and a check mark
  kit.feedback.wrong({ at: element, say: feedback.tryAnother }); // neutral nudge; counts a mistake
  kit.roundComplete(); // after a short kit.scope.setTimeout, so the child sees the last action land
}
```

The shell already supplies the exit (top left, to the area screen), the replay control and the instruction text from `band-6-8` (top center), and the mute control (top right). It speaks `spoken[0]` when each round starts. You cannot leave them out, so do not draw your own.

- **Speech.** `kit.speak(handle)` and `kit.speakSequence([strings.find, numberHandle(3)])`. Strings have no interpolation; use the shared sets in `src/core/strings/shared/` for numbers, letters, colors, and shapes. `kit.setInstruction(handle)` changes what replay says until the round ends. `kit.hint(say?)` counts a hint.
- **Time.** Only `kit.scope.setTimeout`, `setInterval`, `requestFrame`, and `listen`. Leaving the round cancels them. A lint rule bans the global timer functions under `src/features/`. `kit.clock.now()` and `monotonic()` read time.
- **Sound.** `kit.play('pop')` for the names in `src/audio/sfx/sfxNames.ts`. `kit.startSound('brush')` for a sound the child's action drives.
- **Outcome.** `kit.roundComplete()` uses the mistakes counted by `feedback.wrong` and the hints counted by `hint`. Pass `{ mistakes, hintsUsed }` only to override. A second call in a round does nothing.
- **Look.** Real `<button>` elements with labels, `Emoji` for Fluent Emoji, original SVG for the rest. Sizes, colors, and durations from tokens; multiply movement by `--wk-motion-scale`. Color is never the only signal. No string literals in JSX: `t(strings.x)`. No stars, points, counts, timers, or praise that ranks the child.
- **Feedback** never ends a round on a wrong action, never scolds, and never shows disappointment.

## Moving things: useCarry

Every drag uses `useCarry` from `src/activityShell/carry/useCarry.ts`. It gives press, drag, and release, click to pick up and click to place, Enter or Space to pick up and place, arrow keys to move, and Escape to put back. Releasing anywhere that is not a valid place returns the item home.

```tsx
const carry = useCarry<FoodId, PlaceId>(kit, {
  kind: 'targets',
  accepts: (food, place) => place === 'basket' || food === 'apple',
  onDrop: (food, place) => setPlaced({ ...placed, [food]: place }),
});
<button type='button' {...carry.item('apple')} aria-label={t(strings.apple)}>...</button>
<div {...carry.target('basket')}>...</div>
```

The other kinds are `{ kind: 'free', area: ref, position, onPlace, keyStep? }` for a free position, such as a window, and `{ kind: 'axis', axis: 'x', track: ref, min, max, step, value, onChange, onDrop? }` for a slider or a resize handle. The hook sets `data-carried` and `aria-pressed` on the item and `data-carry-valid` and `data-carry-over` on targets; the shell's CSS draws them. `draggable`, `onDrag*`, and `setPointerCapture` are banned outside the kit and the paint studio. An activity with `drag` in `inputs` must use `useCarry`, and its spec must have a test named "click to place".

## Saved state

For state that outlives a session, such as the furthest lesson, add `state: { schema, defaults }` to the definition. Read `kit.state.value` and change it with `kit.state.update((current) => next)`. The session saves it to `profile/<id>/activity/<activity-id>`. Never edit a shared schema for it. `kit.pictures.list('gallery')` and `kit.pictures.read(id, 'thumbnail')` read the child's gallery.

## The end-to-end spec

One file, `e2e/activities/<id>.spec.ts`. Compute every answer from the seed; never read it from the page.

```ts
const SEED = 4242;
let launched: LaunchedApp | undefined;
test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

forEachBand(activity.bands, (band) => {
  test('click to place: picks up the apple and puts it in the basket', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 1 });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), 1, band); // round n uses roundSeed(SEED, n)
    await expectInstructionSpoken(page, strings.instruction);
    await saveBandScreenshot(page, band, activity.id); // reports/screens/<band>/<id>.png
    await expectAccessible(page);
    // Real input: page.mouse, page.keyboard, or locator.click(). Then assert what a child would notice.
  });
});
```

`openActivity` launches the app with a ready profile at 1280 by 800 and opens the activity; pass `size` for other windows (`REVIEW_SIZES` has 1920 by 1080 and 1280 by 800). For timing, pass `pinClockAt` and step with `kitTime(page).advance(ms)` or `.stepFrames(n)`; the shell's pauses are in `src/activityShell/timing.ts`. `spokenIds(page)` lists the strings spoken so far. `nextDifficulty` from `src/core/activityKit/difficulty.ts` gives the level of later rounds. Run `npm run build` once, then `xvfb-run -a npx playwright test --project=electron e2e/activities/<id>.spec.ts`. Playwright empties `test-results/` at the start of each run.

## What the registry test checks

`src/registry/activities.test.ts` fails when an activity's id is not its directory, it sits under another area, its spec, component, or `level.test.ts` is missing, a drag activity lacks `useCarry` or a "click to place" test, `activity.ts`, `level.ts`, or `strings.ts` imports something Playwright cannot load, its icon art is missing, a step file is not listed, or `generateLevel` gives two levels for one seed. Double-click and right-click handlers fail anywhere outside `knock-knock` and `two-buttons`. `npm run check:strings` scans every string for reward, pressure, and scolding words, and `npm run check:voice` fails until the coordinator generates the clips.

## Definition of done

- [ ] The definition states one learning goal and the bands it serves.
- [ ] Every instruction is a spoken string; replay works. Missing clips are listed by `check:voice` for the coordinator.
- [ ] Nothing from hard rule 4: no stars, points, badges, streaks, leaderboards, countdowns, or prompts to keep playing.
- [ ] Timers, listeners, and sounds go through `kit.scope`; leaving cancels them.
- [ ] Every drag uses `useCarry` and has a "click to place" test. Everything except pointer teaching works with the keyboard alone.
- [ ] `level.test.ts` covers the lowest and highest difficulty of every band; `npm run mutation` leaves no unexplained survivor in `level.ts`.
- [ ] The spec completes a round with real input, asserts something a child would notice, runs `expectAccessible`, and saves a screenshot per band.
- [ ] You looked at the screenshot of every band at 1920 by 1080 and 1280 by 800, and fixed clipped art, small targets, crowding, low contrast, and text a 3-year-old must read.
- [ ] `npm run lint`, `format:check`, `typecheck`, `test`, and `check` pass, apart from the clips the coordinator generates.
