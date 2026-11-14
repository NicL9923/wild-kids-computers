import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';

/**
 * Sliders and dials: one to three controls, each with a flag at the spot to reach. A slider
 * slides left and right; a dial turns from pointing left to pointing right. Both snap to marked
 * stops. Difficulty adds stops, so each one is a smaller move, then adds controls, and brings in
 * the dial, which is the harder of the two to steer.
 */

type ControlKind = 'slider' | 'dial';

/** Each control's color, which also names it for a screen reader. */
export const CONTROL_COLORS = ['blue', 'orange', 'pink'] as const;

export interface Control {
  readonly id: string;
  readonly kind: ControlKind;
  readonly color: (typeof CONTROL_COLORS)[number];
  /** The number of stops. Values run from 0 to stops - 1. */
  readonly stops: number;
  readonly start: number;
  readonly target: number;
}

export interface DialsLevel {
  readonly controls: readonly Control[];
}

interface Step {
  readonly kinds: readonly ControlKind[];
  readonly stops: number;
}

/** One entry per difficulty, 1 first. Each step adds stops or a control, not both. */
export const STEPS: readonly Step[] = [
  { kinds: ['slider'], stops: 5 },
  { kinds: ['slider'], stops: 7 },
  { kinds: ['dial'], stops: 7 },
  { kinds: ['slider', 'dial'], stops: 7 },
  { kinds: ['slider', 'dial'], stops: 9 },
  { kinds: ['slider', 'slider', 'dial'], stops: 9 },
  { kinds: ['slider', 'dial', 'dial'], stops: 11 },
];

export const MAX_DIAL_DIFFICULTY = STEPS.length;

/** The fewest stops between where a control starts and its flag. */
export const MIN_MOVE = 2;

/** The pause after the last control reaches its flag. */
export const ALL_MATCHED_MS = 900;

function stepFor(difficulty: number): Step {
  const step = STEPS[difficulty - 1];
  if (!Number.isInteger(difficulty) || step === undefined) {
    throw new RangeError(
      `Sliders and dials has difficulty 1 to ${String(MAX_DIAL_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return step;
}

/** A start and a flag at least MIN_MOVE stops apart. Exported for its test. */
export function startAndTarget(random: Random, stops: number): { start: number; target: number } {
  const target = random.int(0, stops - 1);
  const starts = Array.from({ length: stops }, (_, value) => value).filter(
    (value) => Math.abs(value - target) >= MIN_MOVE,
  );
  return { start: random.pick(starts), target };
}

/** Pure: the same seed and difficulty give the same controls. The band does not change them. */
export function generateLevel(seed: number, difficulty: number, _band: Band): DialsLevel {
  const step = stepFor(difficulty);
  const random = createRandom(seed);
  const colors = random.shuffle(CONTROL_COLORS);
  const controls = step.kinds.map((kind, index) => ({
    id: `control-${String(index)}`,
    kind,
    // There are as many colors as the most controls; the default only satisfies the type checker.
    color: colors[index] ?? 'blue',
    stops: step.stops,
    ...startAndTarget(random, step.stops),
  }));
  return { controls };
}
