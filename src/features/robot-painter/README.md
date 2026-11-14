# Robot painter

The robot painter area: the block program model, the interpreter, the drawing comparison, 30 puzzles, the free mode toolboxes, and the screens built on them. `engine/` and `puzzles/` are plain TypeScript with no React, no DOM, no timers, and no text a child sees.

## Files

| Path                           | What it holds                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `engine/program.ts`            | Block types, the fixed value sets, draft builders, and `countBlocks`, `findBlock`, `toDraft` |
| `engine/validate.ts`           | `validateProgram`, the only way to get a `ValidProgram`, and `buildProgram` for authored use |
| `engine/interpreter.ts`        | `stepProgram` (one step at a time) and `runProgram` (to the end), the step cap, wall bumps   |
| `engine/geometry.ts`           | Units, headings, `TOLERANCE`, `samePoint`                                                    |
| `engine/drawing.ts`            | `canonicalDrawing`, `compareDrawings`, `sameDrawing`, `toPaintPicture`                       |
| `engine/toolbox.ts`            | Toolbox items, `offers`, `checkFit`                                                          |
| `engine/puzzle.ts`             | `definePuzzle`, tiers and bands, `stepPuzzle`, `runPuzzle`, `checkRun` and its hints         |
| `engine/freeMode.ts`           | `FREE_MODES`: the canvas, start, and toolbox for each band                                   |
| `engine/colors.ts`             | Paint values for the six pen colors                                                          |
| `puzzles/<tier>/<id>.ts`       | One puzzle per file, default export from `definePuzzle`                                      |
| `src/registry/robotPuzzles.ts` | `robotPuzzles` and `puzzlesForTier(tier)`, found by file name                                |

## Drive it

```ts
import { puzzlesForTier } from '../../registry/robotPuzzles.ts';
import { toPaintPicture } from './engine/drawing.ts';
import { checkRun, stepPuzzle } from './engine/puzzle.ts';
import { validateProgram } from './engine/validate.ts';

// 1. Load a puzzle. Each tier is one sequence activity, and each puzzle is a step.
const puzzle = puzzlesForTier('tier-2').find((each) => each.id === 'repeatStairs');
if (puzzle === undefined) throw new Error('The puzzle files are missing');

// 2. The screen keeps the child's program as plain data, with its own unique ids.
const checked = validateProgram({
  blocks: [
    {
      id: 'k1',
      kind: 'repeat',
      count: 4,
      body: [
        { id: 'k2', kind: 'move', direction: 'up' },
        { id: 'k3', kind: 'move', direction: 'right' },
      ],
    },
  ],
  definitions: [],
});
if (!checked.ok) throw new Error('A screen that only offers toolbox blocks never gets here');

// 3. Step it. Animate each step, then check the result.
const steps = stepPuzzle(puzzle, checked.program);
let next = steps.next();
for (; !next.done; next = steps.next()) {
  const { blockId, within, robot, drawing, event } = next.value;
  // Highlight blockId, and the repeat and call blocks in `within`. Move the robot to
  // robot.x, robot.y facing robot.heading. Draw `drawing`. On event.kind === 'bumped',
  // play a soft bump toward event.blocked.
}
const result = checkRun(puzzle, next.value);
// result.solved, or result.hints for the screen to speak: see "Hints" below.

// 4. Send the picture to the paint studio as a starting picture.
const picture = toPaintPicture(next.value.segments, puzzle.world.canvas);
// picture.lines: { from, to, color, width } in document pixels on a 1600 by 1000 document.
```

## The model

- **Units.** One arrow step is one canvas unit. x grows right and y grows down. The robot stands on points from 0 to `width` and 0 to `height`, edges included. A heading is whole degrees clockwise from up.
- **Blocks.** `move` (four arrows, which also turn the robot to face that way), `forward` (1 to 20 units), `turn` left or right by an angle from `TURN_ANGLES`, `repeat` (0 to 36 times), `pen-up`, `pen-down`, `color` (six named colors), and `call`. A program also holds `definitions`, each a `define` block with a name and a body.
- **Names of defined blocks** come from `DEFINITION_NAMES`: box, house, petal, flower, tree, leaf, sun, moon. The child picks one, so naming needs no typing. The screen needs a picture and a spoken string for each name.
- **Ids.** Every block, including each `define`, has an id unique in its program. Starting programs from `buildProgram` use positional ids such as `b0`, `b0.1`, `d0`, `d0.2`. A screen that adds blocks must make ids that do not collide with those.
- **Validation.** Call `validateProgram` after every edit. It rejects unknown blocks, values outside the sets, repeat counts out of range, duplicate ids, duplicate definition names, calls to undefined blocks, recursion, and programs over `MAX_PROGRAM_BLOCKS` (200). Each issue has a `reason` and a `path`. The returned program is a frozen copy.
- **Limits per puzzle.** `checkFit(program, puzzle.toolbox, puzzle.blockLimit)` says whether a program uses only offered blocks and fits the block limit. The screen should offer only toolbox blocks and stop adding at the limit. The limit is room on the board, never a score. Any correct program solves the puzzle, however long.

## Running

- `stepProgram` and `stepPuzzle` are generators. Each `next()` runs one primitive block and yields the block id, the enclosing repeat, call, and define ids, the event, the robot, and a fresh copy of the drawing. The generator's return value is the `RunResult`.
- A move that would leave the canvas is a bump: the robot turns to face the edge, stays put, and the run goes on. The result lists every bump.
- A run stops after `MAX_STEPS` (5000) primitive steps with outcome `step-limit`. That is a normal outcome, not an error.
- Repeats and calls that would take no step are skipped, so no program can spin without moving.

## Puzzle kinds

- **direct** (tier 1, first four): there is no program board. Each arrow press appends one `move` block to the program and the screen runs it again, animating only the last step. `checkRun` is solved when the robot stands on `puzzle.finish`, whatever the trail. Mark `puzzle.finish` with something to reach. `DIRECT_PRESS_LIMIT` is 60 presses; start over past that.
- **build**: the child builds a program, then presses go. Solved when the canonical picture equals `puzzle.target`, and, when `puzzle.goal.end` is set, the robot finishes there. Show `puzzle.target` as the faint guide.
- **fix**: like build, starting from `puzzle.startingProgram`, which has exactly one wrong block.
- Some build puzzles also have a `startingProgram`: `longLine` starts with a repeat of two, and the define puzzles in tier 3 start with an empty definition.

## Hints

`checkRun` returns `{ solved: false, hints }` in the order to say them. Each is neutral and carries the geometry so the screen can point at the place. Suggested wording for the string catalog:

| Hint            | Suggested words                       | Data                        |
| --------------- | ------------------------------------- | --------------------------- |
| `step-limit`    | "The robot stopped to rest."          |                             |
| `bumped`        | "The robot bumped the edge."          | `blockIds`                  |
| `not-there-yet` | "Keep going to the flower."           | `at`, `goal`                |
| `nothing-drawn` | "Add some blocks, then press go."     |                             |
| `wrong-color`   | "This line wants another color."      | `stretches` with `expected` |
| `missing-line`  | "A line is missing here."             | `segments`                  |
| `extra-line`    | "The drawing has an extra line here." | `segments`                  |
| `wrong-end`     | "The picture is ready. Now end here." | `at`, `goal`                |

`blocks/speech.ts` holds the words the screen says for each hint.

## Free mode

`FREE_MODES[band]` gives the canvas, start, toolbox, block limit, and style. `band-3-5` is `direct`: arrows that run at once, plus four colors. The older bands build programs. Free mode has no goal and no check.

## Screens

Four activities under `activities/`: `robot-first-steps` (tier 1, `band-3-5` and `band-6-8`), `robot-patterns` (tier 2, `band-6-8` and `band-9-12`), `robot-inventor` (tier 3, `band-9-12`), and `robot-free-draw` (free mode, every band). Each tier's `level.ts` imports its puzzle modules in order and the activity declares `stepsDirectory`, so the registry test catches a puzzle file that is not listed.

| Path                       | What it holds                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `editor/programEdit.ts`    | Pure edits: insert, append, move, remove, update a value, add and remove a defined block. Each result validates. |
| `editor/editorState.ts`    | The program with undo, "start over", and the list a toolbox click adds to                                        |
| `editor/palette.ts`        | What the toolbox shows for a puzzle's toolbox items, and stepping a block's value with plus and minus            |
| `editor/ProgramEditor.tsx` | Toolbox and program for older bands, with `useCarry` for every move                                              |
| `stage/RobotStage.tsx`     | The paper in SVG: dots, faint target, drawing, hints, flower, and the robot                                      |
| `stage/useRobotRun.ts`     | Runs a program one step at a time through the kit scope                                                          |
| `stage/useGlide.ts`        | Glides the robot on the kit's frames, so a pinned test clock steps it and reduced motion jumps                   |
| `screen/RobotPainter.tsx`  | The screen for a puzzle or free play, its three layouts, checking, hints, and "paint it"                         |
| `blocks/`                  | Block pictures and the spoken name of every block and hint                                                       |
| `timing.ts`                | Step pauses and the pause after a run, for the screen and the end-to-end tests                                   |

- **Layouts.** `direct` for direct puzzles and the youngest free play: arrows that move the robot at once. `plan` for the youngest build puzzles: four arrows with go in the middle and a row of places; pressing a placed arrow takes it out. `editor` for every older band: toolbox, program, and the controls go, one step, robot back to the start, undo, and start over.
- **Editing.** A click on a toolbox block adds it at the end of the chosen list; a new repeat or defined block becomes the chosen list. Dragging a toolbox block puts it into any gap. A placed block is picked up by a click or a drag and put into a gap or onto "take the block out". Enter does the same from the keyboard. `useCarry`'s `onClick` option lets the toolbox click add instead of picking up.
- **Checking.** After a run the engine checks the picture. Solved: the kit's confirmation, then two equal choices, next picture or stay here; "next" ends the step. Not solved: the first hint is spoken, the robot goes back to the start after `RESULT_PAUSE_MS`, and the program stays. From the second unsolved run the paper also shows where the drawing differs.
- **Paint it.** Free mode sends the drawing with `toPaintPicture` and `openPaintStudioWith`, and the studio opens with it.
