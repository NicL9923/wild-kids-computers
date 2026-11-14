import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';

/**
 * Catch the fireflies: fireflies drift in slow loops over an evening meadow, and a click on one
 * catches it. Each firefly has its own loop in its own part of the sky, so no two ever touch, and
 * a loop never leaves the sky. Difficulty adds fireflies and makes them smaller and quicker.
 *
 * The sky is 1000 by 600 units and scales to fit. Each firefly circles an oval around its center:
 * `x = cx + rx cos(angle)`, `y = cy + ry sin(angle)`, with the angle turning at a steady rate.
 */

export const SKY = { width: 1000, height: 600 } as const;

/** Space between a loop's outer edge and the sky's edge. */
export const EDGE_MARGIN = 20;

/** The sky is split into this grid, and each firefly loops inside its own cell. */
const CELLS = { columns: 3, rows: 2 } as const;

/** The wait after the last catch, so the child sees it glow before the round ends. */
export const LAST_CATCH_PAUSE_MS = 900;

/** Misses in a row after which the fireflies slow down, as a hint. */
export const MISSES_BEFORE_SLOWING = 3;

/** How much a hint, or reduced motion, slows the fireflies. */
export const SLOW_FACTOR = 0.5;

export interface Firefly {
  readonly id: string;
  /** The center of its loop, in sky units. */
  readonly cx: number;
  readonly cy: number;
  /** The loop's half width and half height. */
  readonly rx: number;
  readonly ry: number;
  /** Where on its loop it starts, in radians. */
  readonly phase: number;
  /** How fast it turns around the loop, in radians a second; the sign says which way. */
  readonly turn: number;
}

export interface FirefliesLevel {
  readonly fireflies: readonly Firefly[];
  /** The size of every firefly, in sky units. */
  readonly size: number;
  /** About how fast a firefly flies, in sky units a second. */
  readonly speed: number;
}

export interface Step {
  readonly count: number;
  readonly size: number;
  /** Sky units a second along the loop's wide side. */
  readonly speed: number;
  /** The loop's half width. Its half height is three fifths of it. */
  readonly loop: number;
}

/** One entry per difficulty, 1 first: one slow, big firefly up to five quicker, smaller ones. */
export const STEPS: readonly Step[] = [
  { count: 1, size: 160, speed: 30, loop: 70 },
  { count: 2, size: 150, speed: 40, loop: 75 },
  { count: 2, size: 140, speed: 55, loop: 80 },
  { count: 3, size: 130, speed: 70, loop: 85 },
  { count: 3, size: 120, speed: 85, loop: 90 },
  { count: 4, size: 110, speed: 100, loop: 95 },
  { count: 4, size: 100, speed: 120, loop: 100 },
  { count: 5, size: 90, speed: 140, loop: 105 },
];

export const MAX_FIREFLY_DIFFICULTY = STEPS.length;

/** The least space between two neighboring cells' loops, in sky units. */
export const LOOP_GAP = 20;

/** A loop's half height for its half width. */
const LOOP_SHAPE = 0.6;

/** The step for a difficulty. Throws outside 1 to MAX_FIREFLY_DIFFICULTY. */
export function stepFor(difficulty: number): Step {
  const step = STEPS[difficulty - 1];
  if (!Number.isInteger(difficulty) || step === undefined) {
    throw new RangeError(
      `Catch the fireflies has difficulty 1 to ${String(MAX_FIREFLY_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return step;
}

/** Pure: the same seed and difficulty give the same fireflies. The band does not change them. */
export function generateLevel(seed: number, difficulty: number, _band: Band): FirefliesLevel {
  const step = stepFor(difficulty);
  const random = createRandom(seed);
  const cellWidth = (SKY.width - 2 * EDGE_MARGIN) / CELLS.columns;
  const cellHeight = (SKY.height - 2 * EDGE_MARGIN) / CELLS.rows;
  const rx = step.loop;
  const ry = Math.round(step.loop * LOOP_SHAPE);
  // How far a loop's center can move up or down inside its cell and keep the whole loop in the
  // cell. Every step's loop already fills its cell's width, so loops stay centered across.
  const slackY = Math.max(0, Math.floor(cellHeight / 2 - ry - step.size / 2 - LOOP_GAP / 2));
  const cells = random.sample(
    Array.from({ length: CELLS.columns * CELLS.rows }, (_, index) => index),
    step.count,
  );
  const fireflies = cells.map((cell, index) => {
    const column = cell % CELLS.columns;
    const row = Math.floor(cell / CELLS.columns);
    return {
      id: `firefly-${String(index)}`,
      cx: Math.round(EDGE_MARGIN + (column + 0.5) * cellWidth),
      cy: Math.round(EDGE_MARGIN + (row + 0.5) * cellHeight) + random.int(-slackY, slackY),
      rx,
      ry,
      phase: Math.round(random.next() * 2 * Math.PI * 1000) / 1000,
      turn: (random.next() < 0.5 ? -1 : 1) * (step.speed / rx),
    };
  });
  return { fireflies, size: step.size, speed: step.speed };
}

/** The firefly's angle after `ms` of flying at `pace` times its own rate. */
export function angleAfter(firefly: Pick<Firefly, 'phase' | 'turn'>, ms: number, pace = 1): number {
  return firefly.phase + firefly.turn * pace * (ms / 1000);
}

/** Where a firefly is at an angle on its loop, in sky units. */
export function positionAt(firefly: Pick<Firefly, 'cx' | 'cy' | 'rx' | 'ry'>, angle: number): { x: number; y: number } {
  return { x: firefly.cx + firefly.rx * Math.cos(angle), y: firefly.cy + firefly.ry * Math.sin(angle) };
}
