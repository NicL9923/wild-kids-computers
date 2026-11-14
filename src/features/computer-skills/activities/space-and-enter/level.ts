import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Space and Enter: a critter walks along a path to its home. Logs and rocks lie across the path,
 * and Space jumps over them. Gates and the front door of home open with Enter.
 *
 * At low difficulty the critter walks to each stop and waits there as long as the child needs.
 * From difficulty 5 it keeps walking, and a press of the right key as it comes near takes it
 * through without stopping. A late press is never punished: the critter stops and waits.
 *
 * The path is 1000 by 320 units and scales to fit. Positions are along the path, in units.
 */

export const PATH = { width: 1000, height: 320 } as const;
/** Where the critter starts, and where the first and last stops are. */
export const START_X = 80;
export const FIRST_STOP_X = 240;
export const LAST_STOP_X = 920;
/** How far before a stop the critter stands to wait, and how far past it a jump lands. */
export const STAND_GAP = 76;
/** How far before a stop the right key already works while the critter keeps walking. */
export const EARLY_WINDOW = 150;

export type StopKind = 'jump' | 'gate' | 'home';
type Walk = 'waits' | 'keeps-walking';

export interface Stop {
  readonly id: string;
  readonly kind: StopKind;
  /** For a jump: what lies across the path. */
  readonly thing: 'log' | 'rock' | null;
  readonly x: number;
}

interface Step {
  readonly jumps: number;
  readonly gates: number;
  readonly walk: Walk;
  /** Walking speed in units per second. */
  readonly speed: number;
}

/** One entry per difficulty, 1 first. Each step changes one or two things a little. */
export const STEPS: readonly Step[] = [
  { jumps: 1, gates: 0, walk: 'waits', speed: 160 },
  { jumps: 2, gates: 0, walk: 'waits', speed: 160 },
  { jumps: 1, gates: 1, walk: 'waits', speed: 160 },
  { jumps: 2, gates: 1, walk: 'waits', speed: 160 },
  { jumps: 2, gates: 1, walk: 'keeps-walking', speed: 110 },
  { jumps: 3, gates: 1, walk: 'keeps-walking', speed: 110 },
  { jumps: 3, gates: 1, walk: 'keeps-walking', speed: 140 },
  { jumps: 2, gates: 2, walk: 'keeps-walking', speed: 140 },
];

export const MAX_JUMP_DIFFICULTY = STEPS.length;

export const CRITTERS = ['rabbit', 'frog', 'kangaroo', 'chick', 'fox'] as const satisfies readonly EmojiId[];

export interface JumpLevel {
  readonly critter: (typeof CRITTERS)[number];
  /** The stops in order along the path. The first is a jump and the last is home. */
  readonly stops: readonly Stop[];
  readonly walk: Walk;
  readonly speed: number;
}

function stepFor(difficulty: number): Step {
  const step = STEPS[difficulty - 1];
  if (!Number.isInteger(difficulty) || step === undefined) {
    throw new RangeError(
      `Space and Enter has difficulty 1 to ${String(MAX_JUMP_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return step;
}

/** Pure: the same seed and difficulty give the same path. The band does not change it. */
export function generateLevel(seed: number, difficulty: number, _band: Band): JumpLevel {
  const step = stepFor(difficulty);
  const random = createRandom(seed);
  // The first stop is always a jump, so Space comes first; the rest of the middle is shuffled.
  const middle = random.shuffle([
    ...Array.from({ length: step.jumps - 1 }, (): StopKind => 'jump'),
    ...Array.from({ length: step.gates }, (): StopKind => 'gate'),
  ]);
  const kinds: StopKind[] = ['jump', ...middle, 'home'];
  const spacing = (LAST_STOP_X - FIRST_STOP_X) / (kinds.length - 1);
  const stops = kinds.map((kind, index) => ({
    id: `stop-${String(index)}`,
    kind,
    thing: kind === 'jump' ? random.pick(['log', 'rock'] as const) : null,
    x: Math.round(FIRST_STOP_X + index * spacing),
  }));
  return { critter: random.pick(CRITTERS), stops, walk: step.walk, speed: step.speed };
}
