import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Knock knock: a row of little houses, each with a closed door and an animal behind it. One click
 * knocks. Two clicks close together open the door. At first the two clicks may be well over a
 * second apart; difficulty brings the gap down to half a second, the usual double-click setting,
 * and adds doors.
 *
 * The street is 1000 by 600 units and scales to fit. Doors stand in one row.
 */

export const STREET = { width: 1000, height: 600 } as const;

/** Space between the outer houses and the street's edge. */
export const EDGE_MARGIN = 30;

/** Where every door and house stands: the bottom of the doors, in street units. */
export const GROUND_Y = 520;

/** A house's width and height, in door widths. The door stands at the bottom of its wall. */
export const HOUSE = { width: 1.4, height: 2.3 } as const;

/** The wait after the last door opens, so the child sees who is there. */
export const OPENED_PAUSE_MS = 1400;

/** Single knocks in a round before the voice explains the two quick clicks, as a hint. */
export const KNOCKS_PER_HINT = 2;

export const GUESTS = [
  'cat',
  'dog',
  'rabbit',
  'fox',
  'bear',
  'owl',
  'panda',
  'mouse',
  'frog',
  'duck',
  'hedgehog',
  'raccoon',
] as const satisfies readonly EmojiId[];

/** Door paint, only for variety. Each door also has its own animal, so color tells nothing. */
export const PAINTS = ['red', 'blue', 'green', 'yellow', 'purple'] as const;

export interface Door {
  readonly id: string;
  /** The center, in street units. */
  readonly x: number;
  readonly guest: (typeof GUESTS)[number];
  readonly paint: (typeof PAINTS)[number];
}

export interface KnockLevel {
  readonly doors: readonly Door[];
  /** Door width in street units. The height is half again as much. */
  readonly width: number;
  /** The most time between two clicks that still opens a door, in milliseconds. */
  readonly windowMs: number;
}

export interface Step {
  readonly count: number;
  readonly width: number;
  readonly windowMs: number;
}

/** One entry per difficulty, 1 first: more doors, a little smaller, and quicker clicks. */
export const STEPS: readonly Step[] = [
  { count: 2, width: 190, windowMs: 1200 },
  { count: 3, width: 175, windowMs: 1000 },
  { count: 3, width: 165, windowMs: 850 },
  { count: 4, width: 150, windowMs: 700 },
  { count: 4, width: 140, windowMs: 600 },
  { count: 5, width: 130, windowMs: 500 },
];

export const MAX_KNOCK_DIFFICULTY = STEPS.length;

/** A door's height for its width. */
export const DOOR_SHAPE = 1.5;

/** The step for a difficulty. Throws outside 1 to MAX_KNOCK_DIFFICULTY. */
export function stepFor(difficulty: number): Step {
  const step = STEPS[difficulty - 1];
  if (!Number.isInteger(difficulty) || step === undefined) {
    throw new RangeError(`Knock knock has difficulty 1 to ${String(MAX_KNOCK_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return step;
}

/** Pure: the same seed and difficulty give the same street. The band does not change it. */
export function generateLevel(seed: number, difficulty: number, _band: Band): KnockLevel {
  const step = stepFor(difficulty);
  const random = createRandom(seed);
  const guests = random.sample(GUESTS, step.count);
  const slot = (STREET.width - 2 * EDGE_MARGIN) / step.count;
  // Each door gets a paint unlike the door before it.
  const doors: Door[] = [];
  for (const [index, guest] of guests.entries()) {
    const before = doors.at(-1)?.paint;
    doors.push({
      id: `door-${String(index)}`,
      x: Math.round(EDGE_MARGIN + (index + 0.5) * slot),
      guest,
      paint: random.pick(PAINTS.filter((paint) => paint !== before)),
    });
  }
  return { doors, width: step.width, windowMs: step.windowMs };
}

/**
 * Whether a click at `now` makes a double click with the click before it, at `previous`. Both are
 * kit clock times in milliseconds; `previous` is null when there was no click before.
 */
export function isDoubleClick(previous: number | null, now: number, windowMs: number): boolean {
  return previous !== null && now - previous <= windowMs;
}
