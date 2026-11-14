import type { Band } from '../../../core/bands.ts';
import { canonicalDrawing, compareDrawings, type WrongColor } from './drawing.ts';
import { insideCanvas, normalizeHeading, samePoint, type Canvas, type Point, type Segment } from './geometry.ts';
import { runProgram, stepProgram, type RobotState, type RunResult, type RunStep, type World } from './interpreter.ts';
import type { PenColor } from './program.ts';
import { checkFit, type ToolboxItem } from './toolbox.ts';
import type { ValidProgram } from './validate.ts';

export const TIERS = ['tier-1', 'tier-2', 'tier-3'] as const;
export type Tier = (typeof TIERS)[number];

/** The band each tier serves. Each tier is one sequence activity. */
export const TIER_BANDS: Readonly<Record<Tier, Band>> = {
  'tier-1': 'band-3-5',
  'tier-2': 'band-6-8',
  'tier-3': 'band-9-12',
};

/**
 * - `direct`: each arrow the child presses runs at once. The program is the list of presses.
 *   The child reaches the place where the reference ends, and the trail may wander.
 * - `build`: the child builds a program, then runs it. The picture must match.
 * - `fix`: like build, but the puzzle starts with a program that has one wrong block.
 */
type PuzzleKind = 'direct' | 'build' | 'fix';

export interface PuzzleSpec {
  /** camelCase, the same as the file name. */
  readonly id: string;
  readonly tier: Tier;
  /** Position within the tier, easiest first. */
  readonly order: number;
  readonly kind: PuzzleKind;
  readonly canvas: Canvas;
  readonly start: {
    readonly x: number;
    readonly y: number;
    /** Whole degrees clockwise from up. Defaults to 0, facing up. */
    readonly heading?: number;
    readonly color?: PenColor;
  };
  readonly toolbox: readonly ToolboxItem[];
  /** The most blocks the program may hold. A limit, never a score. */
  readonly blockLimit: number;
  /** One correct program. The target picture is what it draws. */
  readonly solution: ValidProgram;
  readonly startingProgram?: ValidProgram;
  /** For build and fix: the robot must also finish where the solution finishes. */
  readonly mustEndAtFinish?: boolean;
}

type PuzzleGoal =
  /** Solved when the robot stands at `at`, whatever it drew on the way. */
  | { readonly kind: 'reach'; readonly at: Point }
  /** Solved when the picture matches `target`, and the robot ends at `end` when that is set. */
  | { readonly kind: 'picture'; readonly end: Point | null };

export interface Puzzle extends Omit<PuzzleSpec, 'start' | 'mustEndAtFinish'> {
  readonly world: World;
  /** The canonical picture the solution draws. A screen shows it as the faint guide. */
  readonly target: readonly Segment[];
  /** Where the solution finishes. A screen can mark it, such as with a flower to reach. */
  readonly finish: Point;
  readonly goal: PuzzleGoal;
}

/**
 * A direct puzzle has no program grid, so its limit only stops a press log from growing
 * without end. A child who wanders that far can start over.
 */
export const DIRECT_PRESS_LIMIT = 60;

const PUZZLE_ID = /^[a-z][a-zA-Z0-9]*$/;

function fail(id: string, problem: string): never {
  throw new Error(`Puzzle "${id}": ${problem}`);
}

/**
 * Checks an authored puzzle and computes its target by running the solution, so a puzzle
 * cannot be unsolvable. Throws on a mistake, which the puzzle tests catch at import.
 */
export function definePuzzle(spec: PuzzleSpec): Puzzle {
  const { id, canvas } = spec;
  if (!PUZZLE_ID.test(id)) fail(id, 'the id must be camelCase');
  if (!Number.isInteger(spec.order) || spec.order < 1) fail(id, 'the order must be a whole number from 1');
  if (!Number.isInteger(canvas.width) || !Number.isInteger(canvas.height) || canvas.width < 1 || canvas.height < 1) {
    fail(id, 'the canvas must be at least one whole unit each way');
  }
  const heading = spec.start.heading ?? 0;
  if (!Number.isInteger(heading)) fail(id, 'the start heading must be whole degrees');
  const start: RobotState = {
    x: spec.start.x,
    y: spec.start.y,
    heading: normalizeHeading(heading),
    penDown: true,
    color: spec.start.color ?? 'blue',
  };
  if (!insideCanvas(start, canvas)) fail(id, 'the robot must start on the canvas');

  for (const [name, program] of [
    ['solution', spec.solution],
    ['starting program', spec.startingProgram],
  ] as const) {
    if (program === undefined) continue;
    const issues = checkFit(program, spec.toolbox, spec.blockLimit);
    if (issues.length > 0) fail(id, `the ${name} does not fit: ${JSON.stringify(issues)}`);
  }
  if (spec.kind === 'fix' && spec.startingProgram === undefined) fail(id, 'a fix puzzle needs a starting program');
  if (spec.kind === 'direct') {
    if (spec.startingProgram !== undefined) fail(id, 'a direct puzzle starts empty');
    if (spec.toolbox.some((item) => item.kind !== 'move')) fail(id, 'a direct puzzle offers only arrows');
    if (spec.mustEndAtFinish !== undefined) fail(id, 'a direct puzzle always ends at the finish');
  }

  const world: World = { canvas, start };
  const reference = runProgram(spec.solution, world);
  if (reference.outcome !== 'finished') fail(id, 'the solution reaches the step cap');
  if (reference.bumps.length > 0) fail(id, 'the solution bumps into an edge');
  const target = canonicalDrawing(reference.segments);
  if (target.length === 0) fail(id, 'the solution draws nothing');

  const { start: _start, mustEndAtFinish, ...rest } = spec;
  const finish = { x: reference.robot.x, y: reference.robot.y };
  return {
    ...rest,
    world,
    target,
    finish,
    goal:
      spec.kind === 'direct'
        ? { kind: 'reach', at: finish }
        : { kind: 'picture', end: mustEndAtFinish === true ? finish : null },
  };
}

export function runPuzzle(puzzle: Puzzle, program: ValidProgram): RunResult {
  return runProgram(program, puzzle.world);
}

export function stepPuzzle(puzzle: Puzzle, program: ValidProgram): Generator<RunStep, RunResult> {
  return stepProgram(program, puzzle.world);
}

/**
 * A neutral note a screen can speak and show. Each one says what is different, never that
 * the child did badly. Geometry is in canvas units so a screen can point at the place.
 */
type Hint =
  /** The robot stopped at the step cap with blocks still to run. */
  | { readonly kind: 'step-limit' }
  /** A move would have left the canvas, so the robot stayed put. */
  | { readonly kind: 'bumped'; readonly blockIds: readonly string[] }
  /** Direct puzzles: the robot has not reached the place yet. */
  | { readonly kind: 'not-there-yet'; readonly at: Point; readonly goal: Point }
  | { readonly kind: 'nothing-drawn' }
  | { readonly kind: 'wrong-color'; readonly stretches: readonly WrongColor[] }
  | { readonly kind: 'missing-line'; readonly segments: readonly Segment[] }
  | { readonly kind: 'extra-line'; readonly segments: readonly Segment[] }
  /** The picture matches, and the robot should finish somewhere else. */
  | { readonly kind: 'wrong-end'; readonly at: Point; readonly goal: Point };

export type CheckResult = { readonly solved: true } | { readonly solved: false; readonly hints: readonly Hint[] };

/**
 * Whether a run solves the puzzle. Any correct program counts the same as the reference,
 * however long it is. Hints come in the order a screen should say them: first what stopped
 * the robot, then what the picture lacks or has too much of.
 */
export function checkRun(puzzle: Puzzle, run: RunResult): CheckResult {
  const at = { x: run.robot.x, y: run.robot.y };
  const hints: Hint[] = [];
  if (run.outcome === 'step-limit') hints.push({ kind: 'step-limit' });

  if (puzzle.goal.kind === 'reach') {
    // Each press of a direct puzzle is final, so standing on the place is enough.
    if (samePoint(at, puzzle.goal.at)) return { solved: true };
    if (run.bumps.length > 0) hints.push({ kind: 'bumped', blockIds: run.bumps.map((bump) => bump.blockId) });
    hints.push({ kind: 'not-there-yet', at, goal: puzzle.goal.at });
    return { solved: false, hints };
  }

  const difference = compareDrawings(run.segments, puzzle.target);
  const pictureHints: Hint[] = [];
  if (run.segments.length === 0) pictureHints.push({ kind: 'nothing-drawn' });
  else {
    if (difference.wrongColor.length > 0) pictureHints.push({ kind: 'wrong-color', stretches: difference.wrongColor });
    if (difference.missing.length > 0) pictureHints.push({ kind: 'missing-line', segments: difference.missing });
    if (difference.extra.length > 0) pictureHints.push({ kind: 'extra-line', segments: difference.extra });
  }
  const end = puzzle.goal.end;
  if (pictureHints.length === 0 && end !== null && !samePoint(at, end)) {
    pictureHints.push({ kind: 'wrong-end', at, goal: end });
  }
  if (hints.length === 0 && pictureHints.length === 0) return { solved: true };
  if (run.bumps.length > 0) hints.push({ kind: 'bumped', blockIds: run.bumps.map((bump) => bump.blockId) });
  return { solved: false, hints: [...hints, ...pictureHints] };
}
