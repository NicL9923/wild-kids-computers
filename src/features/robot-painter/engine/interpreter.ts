import {
  DIRECTION_HEADINGS,
  insideCanvas,
  normalizeHeading,
  unitStep,
  type Canvas,
  type Point,
  type Segment,
} from './geometry.ts';
import type { Block, Definition, LeafBlock, PenColor } from './program.ts';
import type { ValidProgram } from './validate.ts';

/**
 * The robot. `heading` is whole degrees clockwise from up. The pen starts down, so the first
 * move draws, which is what a child expects from the youngest puzzles.
 */
export interface RobotState {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly penDown: boolean;
  readonly color: PenColor;
}

/** Where a run starts. A puzzle supplies one, and free mode supplies one per band. */
export interface World {
  readonly canvas: Canvas;
  readonly start: RobotState;
}

/**
 * The most primitive steps one run may take. Recursion is not allowed, so every valid program
 * ends, but nested repeats can still be long. Reaching the cap is an ordinary outcome.
 */
export const MAX_STEPS = 5000;

/** What one primitive step did. */
type StepEvent =
  /** The robot moved. `segment` is the line it drew, or null with the pen up. */
  | { readonly kind: 'moved'; readonly segment: Segment | null }
  /** The move would leave the canvas. The robot turned to face the edge and stayed put. */
  | { readonly kind: 'bumped'; readonly blocked: Point }
  | { readonly kind: 'turned' }
  | { readonly kind: 'pen-up' }
  | { readonly kind: 'pen-down' }
  | { readonly kind: 'color' };

export interface RunStep {
  /** 0 for the first primitive step. */
  readonly index: number;
  /** The primitive block that ran. */
  readonly blockId: string;
  /**
   * The repeat, call, and define blocks around it, outermost first. A screen highlights these
   * too, so the child sees which repeat or which defined block is running.
   */
  readonly within: readonly string[];
  readonly event: StepEvent;
  readonly robot: RobotState;
  /** Every line drawn so far, in drawing order. A fresh array for each step. */
  readonly drawing: readonly Segment[];
}

interface Bump {
  readonly blockId: string;
  /** Where the robot stood. */
  readonly at: Point;
  /** Where the move would have gone. */
  readonly blocked: Point;
}

export interface RunResult {
  /** `step-limit` means the run stopped after MAX_STEPS steps with blocks still to run. */
  readonly outcome: 'finished' | 'step-limit';
  readonly robot: RobotState;
  /** Every line drawn, in drawing order. canonicalDrawing turns this into the picture. */
  readonly segments: readonly Segment[];
  readonly bumps: readonly Bump[];
  readonly steps: number;
}

/** The path above the program's own blocks. One array, so both entry points start the same. */
const TOP: readonly string[] = [];

interface StepRecord {
  readonly blockId: string;
  readonly within: readonly string[];
  readonly event: StepEvent;
}

/** One run in progress. Only this module changes it. */
class Machine {
  robot: RobotState;
  readonly segments: Segment[] = [];
  readonly bumps: Bump[] = [];
  steps = 0;
  halted = false;
  private readonly definitions: readonly Definition[];
  private readonly known = new Map<Block, boolean>();
  private readonly canvas: Canvas;
  private readonly limit: number;

  constructor(program: ValidProgram, world: World, limit: number) {
    this.robot = world.start;
    this.canvas = world.canvas;
    this.limit = limit;
    this.definitions = program.definitions;
  }

  /**
   * Whether running a block takes at least one primitive step. A repeat or a call that takes
   * none is skipped, so every loop pass and every call reaches a step, and the step cap bounds
   * all the work. The answer is kept per block, so a deep chain of definitions is checked once,
   * not once per path through it.
   */
  private takesSteps(block: Block): boolean {
    if (block.kind !== 'repeat' && block.kind !== 'call') return true;
    let known = this.known.get(block);
    if (known === undefined) {
      known =
        block.kind === 'repeat'
          ? block.count > 0 && block.body.some((inner) => this.takesSteps(inner))
          : this.definitions.some(
              (definition) => definition.name === block.name && definition.body.some((inner) => this.takesSteps(inner)),
            );
      this.known.set(block, known);
    }
    return known;
  }

  *run(blocks: readonly Block[], within: readonly string[]): Generator<StepRecord, void> {
    for (const block of blocks) {
      if (!this.takesSteps(block)) continue;
      if (block.kind === 'repeat') {
        const inner = [...within, block.id];
        for (let pass = 0; pass < block.count && !this.halted; pass++) yield* this.run(block.body, inner);
      } else if (block.kind === 'call') {
        // Names are unique in a ValidProgram, and every call has a definition, so one body runs.
        for (const definition of this.definitions) {
          if (definition.name === block.name) yield* this.run(definition.body, [...within, block.id, definition.id]);
        }
      } else {
        if (this.steps >= this.limit) {
          this.halted = true;
          return;
        }
        this.steps++;
        yield { blockId: block.id, within, event: this.apply(block) };
      }
    }
  }

  private apply(block: Exclude<LeafBlock, { kind: 'call' }>): StepEvent {
    const robot = this.robot;
    switch (block.kind) {
      case 'move':
        return this.move({ ...robot, heading: DIRECTION_HEADINGS[block.direction] }, 1, block.id);
      case 'forward':
        return this.move(robot, block.distance, block.id);
      case 'turn': {
        const turn = block.direction === 'right' ? block.angle : -block.angle;
        this.robot = { ...robot, heading: normalizeHeading(robot.heading + turn) };
        return { kind: 'turned' };
      }
      case 'pen-up':
        this.robot = { ...robot, penDown: false };
        return { kind: 'pen-up' };
      case 'pen-down':
        this.robot = { ...robot, penDown: true };
        return { kind: 'pen-down' };
      default:
        this.robot = { ...robot, color: block.color };
        return { kind: 'color' };
    }
  }

  private move(facing: RobotState, distance: number, blockId: string): StepEvent {
    const step = unitStep(facing.heading);
    const from = { x: facing.x, y: facing.y };
    const to = { x: facing.x + step.x * distance, y: facing.y + step.y * distance };
    if (!insideCanvas(to, this.canvas)) {
      this.robot = facing;
      this.bumps.push({ blockId, at: from, blocked: to });
      return { kind: 'bumped', blocked: to };
    }
    this.robot = { ...facing, ...to };
    if (!facing.penDown) return { kind: 'moved', segment: null };
    const segment: Segment = { from, to, color: facing.color };
    this.segments.push(segment);
    return { kind: 'moved', segment };
  }

  result(): RunResult {
    return {
      outcome: this.halted ? 'step-limit' : 'finished',
      robot: this.robot,
      segments: [...this.segments],
      bumps: [...this.bumps],
      steps: this.steps,
    };
  }
}

/**
 * Runs a program one primitive step at a time. Each yielded step carries the robot and the
 * drawing after that step, and the generator returns the whole result when it ends.
 *
 *     const steps = stepProgram(program, world);
 *     for (let next = steps.next(); ; next = steps.next()) {
 *       if (next.done) { show(next.value); break; }
 *       animate(next.value);
 *     }
 */
export function* stepProgram(program: ValidProgram, world: World, limit = MAX_STEPS): Generator<RunStep, RunResult> {
  const machine = new Machine(program, world, limit);
  for (const record of machine.run(program.blocks, TOP)) {
    yield { ...record, index: machine.steps - 1, robot: machine.robot, drawing: [...machine.segments] };
  }
  return machine.result();
}

/** Runs a program to the end, or to the step cap, without building a picture for each step. */
export function runProgram(program: ValidProgram, world: World, limit = MAX_STEPS): RunResult {
  const machine = new Machine(program, world, limit);
  for (const _ of machine.run(program.blocks, TOP)) {
    // Each pass applies one step. Only the end matters here.
  }
  return machine.result();
}
