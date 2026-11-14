import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Wake the meadow: sleeping buds in a grassy board. Moving the pointer over the grass wakes every
 * bud within reach of where it passed. The round ends once three quarters of the buds are awake,
 * so a child never has to hunt for the last one.
 *
 * The meadow is 1000 by 600 units and scales to fit the window. Buds sit one to a cell of an even
 * grid, nudged a little inside their cell, so they never touch and always spread over the board.
 * A sweep along the middle of each row wakes that whole row.
 */

export const MEADOW = { width: 1000, height: 600 } as const;

/** Space between the outer cells and the meadow's edge. */
export const EDGE_MARGIN = 20;

/** The wait after the meadow wakes, so the child sees every flower open before the round ends. */
export const AWAKE_PAUSE_MS = 1400;

/** The flowers a bud can open into. */
export const FLOWERS = ['flower', 'tulip', 'sunflower', 'rose', 'cherry-blossom'] as const satisfies readonly EmojiId[];

export interface Bud {
  readonly id: string;
  /** The center, in meadow units. */
  readonly x: number;
  readonly y: number;
  readonly flower: (typeof FLOWERS)[number];
}

export interface MeadowLevel {
  readonly buds: readonly Bud[];
  /** How far from the pointer's path a bud wakes, in meadow units. */
  readonly reach: number;
  /** The size of every bud and flower, in meadow units. */
  readonly size: number;
  /** How many buds must be awake to end the round. */
  readonly needed: number;
}

export interface Step {
  readonly columns: number;
  readonly rows: number;
  readonly reach: number;
}

/**
 * One entry per difficulty, 1 first. More buds in more rows, and a smaller reach, so the child
 * moves over more of the meadow. At the easiest, two rows and a wide reach mean one sweep across
 * the middle is enough.
 */
export const STEPS: readonly Step[] = [
  { columns: 4, rows: 2, reach: 180 },
  { columns: 5, rows: 2, reach: 165 },
  { columns: 5, rows: 3, reach: 150 },
  { columns: 6, rows: 3, reach: 130 },
  { columns: 7, rows: 3, reach: 115 },
  { columns: 7, rows: 4, reach: 100 },
];

export const MAX_MEADOW_DIFFICULTY = STEPS.length;

/** The share of buds that wakes the whole meadow. */
const AWAKE_SHARE = 3 / 4;

/** A bud takes this share of its cell's shorter side, which leaves room to nudge it. */
const BUD_SHARE = 0.62;

/** The step for a difficulty. Throws outside 1 to MAX_MEADOW_DIFFICULTY. */
export function stepFor(difficulty: number): Step {
  const step = STEPS[difficulty - 1];
  if (!Number.isInteger(difficulty) || step === undefined) {
    throw new RangeError(
      `Wake the meadow has difficulty 1 to ${String(MAX_MEADOW_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return step;
}

/** Pure: the same seed and difficulty give the same meadow. The band does not change it. */
export function generateLevel(seed: number, difficulty: number, _band: Band): MeadowLevel {
  const step = stepFor(difficulty);
  const random = createRandom(seed);
  const cellWidth = (MEADOW.width - 2 * EDGE_MARGIN) / step.columns;
  const cellHeight = (MEADOW.height - 2 * EDGE_MARGIN) / step.rows;
  const size = Math.floor(Math.min(cellWidth, cellHeight) * BUD_SHARE);
  // The farthest a bud moves from its cell's center: half the room it has, so neighbors keep a gap.
  const slackX = Math.floor((cellWidth - size) / 4);
  const slackY = Math.floor((cellHeight - size) / 4);
  const buds: Bud[] = [];
  for (let row = 0; row < step.rows; row += 1) {
    for (let column = 0; column < step.columns; column += 1) {
      buds.push({
        id: `bud-${String(buds.length)}`,
        x: Math.round(EDGE_MARGIN + (column + 0.5) * cellWidth) + random.int(-slackX, slackX),
        y: Math.round(EDGE_MARGIN + (row + 0.5) * cellHeight) + random.int(-slackY, slackY),
        flower: random.pick(FLOWERS),
      });
    }
  }
  return { buds, reach: step.reach, size, needed: Math.ceil(buds.length * AWAKE_SHARE) };
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The distance from a point to the segment from `from` to `to`. */
export function distanceToSegment(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const along = lengthSquared === 0 ? 0 : ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared;
  const t = Math.min(1, Math.max(0, along));
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}

/**
 * The buds the pointer wakes as it moves from `from` to `to`, in meadow units. A fast swipe gives
 * far-apart pointer events, so every bud near the whole segment wakes, not only the ends.
 */
export function budsWokenBy(level: Pick<MeadowLevel, 'buds' | 'reach'>, from: Point, to: Point): string[] {
  return level.buds.filter((bud) => distanceToSegment(bud, from, to) <= level.reach).map((bud) => bud.id);
}
