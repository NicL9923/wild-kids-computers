import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';

/**
 * Pop the seed pods: large pods that stay still, far apart, and never near the exit control.
 *
 * The board is 1000 by 600 units and scales to fit the window, so one unit is about one CSS
 * pixel at a 1280 by 800 window. A pod's size is its diameter in units. The smallest pod, 160
 * units, is more than twice the youngest band's smallest target at that window.
 */

export const BOARD = { width: 1000, height: 600 } as const;

/** The wait after the last pod pops, so the child sees it burst before the round ends. */
export const LAST_POP_PAUSE_MS = 700;

/**
 * The corner of the board nearest the exit control, top left. No pod comes within KEEP_OUT_GAP
 * of it, so a child reaching for a pod never lands on the way out.
 */
export const EXIT_KEEP_OUT = { left: 0, top: 0, right: 300, bottom: 220 } as const;
export const KEEP_OUT_GAP = 40;
/** Space between a pod and the board's edge. */
export const EDGE_MARGIN = 20;

export interface Pod {
  readonly id: string;
  /** The center, in board units. */
  readonly x: number;
  readonly y: number;
  /** The diameter, in board units. */
  readonly size: number;
}

export interface PodsLevel {
  readonly pods: readonly Pod[];
  /** The smallest space between two pods' edges, in board units. */
  readonly gap: number;
}

type Spot = readonly [x: number, y: number];

/**
 * Spread-out layouts, used when random placement does not find room. The level test checks them
 * against the same rules as random layouts, at every difficulty that uses them.
 */
const SPREAD: Readonly<Record<'one' | 'two' | 'three' | 'four' | 'five', readonly Spot[]>> = {
  one: [[600, 330]],
  two: [
    [330, 420],
    [740, 300],
  ],
  three: [
    [200, 440],
    [500, 260],
    [800, 440],
  ],
  four: [
    [200, 450],
    [450, 280],
    [690, 460],
    [860, 200],
  ],
  five: [
    [150, 470],
    [390, 330],
    [610, 480],
    [800, 210],
    [870, 460],
  ],
};

export interface Step {
  /** How many pods: the length of `fallback`. */
  readonly count: number;
  readonly size: number;
  readonly gap: number;
  /** Where the pods go when random placement finds no room. */
  readonly fallback: readonly Spot[];
}

function makeStep(size: number, gap: number, fallback: readonly Spot[]): Step {
  return { count: fallback.length, size, gap, fallback };
}

/** One entry per difficulty, 1 first: more pods, a little smaller, a little closer. */
export const STEPS: readonly Step[] = [
  makeStep(260, 160, SPREAD.one),
  makeStep(240, 140, SPREAD.two),
  makeStep(220, 120, SPREAD.three),
  makeStep(200, 100, SPREAD.three),
  makeStep(180, 80, SPREAD.four),
  makeStep(160, 60, SPREAD.five),
];

/** The highest difficulty this activity defines. */
export const MAX_POD_DIFFICULTY = STEPS.length;

function distanceToKeepOut(x: number, y: number): number {
  const dx = Math.max(EXIT_KEEP_OUT.left - x, 0, x - EXIT_KEEP_OUT.right);
  const dy = Math.max(EXIT_KEEP_OUT.top - y, 0, y - EXIT_KEEP_OUT.bottom);
  return Math.hypot(dx, dy);
}

/** Whether a pod fits on the board with room around it. Exported for the level test. */
export function fits(
  pod: Pick<Pod, 'x' | 'y' | 'size'>,
  others: readonly Pick<Pod, 'x' | 'y' | 'size'>[],
  gap: number,
) {
  const radius = pod.size / 2;
  if (pod.x - radius < EDGE_MARGIN || pod.x + radius > BOARD.width - EDGE_MARGIN) return false;
  if (pod.y - radius < EDGE_MARGIN || pod.y + radius > BOARD.height - EDGE_MARGIN) return false;
  if (distanceToKeepOut(pod.x, pod.y) < radius + KEEP_OUT_GAP) return false;
  return others.every((other) => Math.hypot(pod.x - other.x, pod.y - other.y) >= radius + other.size / 2 + gap);
}

const ATTEMPTS_PER_POD = 60;
const LAYOUT_TRIES = 12;

function randomLayout(random: Random, step: Step): Pod[] | null {
  const radius = step.size / 2;
  const pods: Pod[] = [];
  for (let index = 0; index < step.count; index += 1) {
    let placed = false;
    for (let attempt = 0; attempt < ATTEMPTS_PER_POD && !placed; attempt += 1) {
      const x = random.int(EDGE_MARGIN + radius, BOARD.width - EDGE_MARGIN - radius);
      const y = random.int(EDGE_MARGIN + radius, BOARD.height - EDGE_MARGIN - radius);
      const pod = { id: `pod-${String(index)}`, x, y, size: step.size };
      if (fits(pod, pods, step.gap)) {
        pods.push(pod);
        placed = true;
      }
    }
    if (!placed) return null;
  }
  return pods;
}

/** The step for a difficulty. Throws outside 1 to MAX_POD_DIFFICULTY. */
export function stepFor(difficulty: number): Step {
  const step = STEPS[difficulty - 1];
  if (!Number.isInteger(difficulty) || step === undefined) {
    throw new RangeError(
      `Pop the seed pods has difficulty 1 to ${String(MAX_POD_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return step;
}

/**
 * Pods placed at random where they fit, or the spread-out fallback layout when a few tries find
 * no room. Exported so its test can hand it a generator that never finds room.
 */
export function placePods(random: Random, step: Step): Pod[] {
  for (let attempt = 0; attempt < LAYOUT_TRIES; attempt += 1) {
    const pods = randomLayout(random, step);
    if (pods !== null) return pods;
  }
  return step.fallback.map(([x, y], index) => ({ id: `pod-${String(index)}`, x, y, size: step.size }));
}

/** Pure: the same seed and difficulty give the same pods. The band does not change the layout. */
export function generateLevel(seed: number, difficulty: number, _band: Band): PodsLevel {
  const step = stepFor(difficulty);
  return { pods: placePods(createRandom(seed), step), gap: step.gap };
}
