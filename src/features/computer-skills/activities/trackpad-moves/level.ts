import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Trackpad moves: a scene several screens big in a scrolling window. Something is hidden a
 * screen or more away. The child scrolls with two fingers to bring it into view, then taps it. A
 * mouse wheel scrolls and a click taps, so a mouse works too.
 *
 * The scene is a grid of screens. Each screen is 1000 by 600 units, the window's own size.
 * Difficulty makes the hidden things farther, adds more of them per round, and turns the scroll
 * from down only, to down and up, to every way.
 */

export const SCREEN = { width: 1000, height: 600 } as const;

export type Direction = 'down' | 'up' | 'right' | 'left';

/** Where a hidden thing sits inside its screen: the middle, so it is out of view one screen away. */
export const INNER = { left: 300, right: 700, top: 180, bottom: 420 } as const;
/** A hidden thing's size, in units. */
export const THING_SIZE = 130;
/** A decoration's size, in units. */
export const DECOR_SIZE = 120;

export const THINGS = [
  'apple',
  'teddy-bear',
  'balloon',
  'kite',
  'present',
  'soccer-ball',
  'rocket',
  'umbrella',
  'guitar',
  'cupcake',
  'sunflower',
  'turtle',
  'owl',
  'penguin',
] as const satisfies readonly EmojiId[];

/** Decorations in every screen, so scrolling shows the scene moving. */
export const DECOR = [
  'tree',
  'pine-tree',
  'cloud',
  'flower',
  'rock',
  'mushroom',
  'seedling',
  'tulip',
] as const satisfies readonly EmojiId[];

interface Step {
  readonly columns: number;
  readonly rows: number;
  readonly finds: number;
  readonly directions: readonly Direction[];
  /** The farthest a hidden thing is, in screens. */
  readonly reach: number;
}

const VERTICAL: readonly Direction[] = ['down', 'up'];
const EVERY_WAY: readonly Direction[] = ['down', 'up', 'right', 'left'];

/** One entry per difficulty, 1 first. */
export const STEPS: readonly Step[] = [
  { columns: 1, rows: 2, finds: 1, directions: ['down'], reach: 1 },
  { columns: 1, rows: 3, finds: 1, directions: ['down'], reach: 2 },
  { columns: 1, rows: 3, finds: 2, directions: VERTICAL, reach: 1 },
  { columns: 1, rows: 3, finds: 2, directions: VERTICAL, reach: 2 },
  { columns: 3, rows: 3, finds: 2, directions: EVERY_WAY, reach: 1 },
  { columns: 3, rows: 3, finds: 3, directions: EVERY_WAY, reach: 1 },
  { columns: 3, rows: 3, finds: 3, directions: EVERY_WAY, reach: 2 },
  { columns: 3, rows: 3, finds: 4, directions: EVERY_WAY, reach: 2 },
];

export const MAX_TRACKPAD_DIFFICULTY = STEPS.length;

/** The pause after the last tap, so the child sees it land. */
export const LAST_TAP_MS = 900;

export interface ScreenCell {
  readonly column: number;
  readonly row: number;
}

export interface Find {
  readonly id: string;
  readonly kind: (typeof THINGS)[number];
  /** Which way to scroll from the screen before. */
  readonly direction: Direction;
  readonly screen: ScreenCell;
  /** The center, in units inside its screen. */
  readonly x: number;
  readonly y: number;
}

export interface Decoration {
  readonly id: string;
  readonly kind: (typeof DECOR)[number];
  /** The center, in units across the whole scene. */
  readonly x: number;
  readonly y: number;
}

export interface TrackpadLevel {
  readonly columns: number;
  readonly rows: number;
  readonly start: ScreenCell;
  readonly finds: readonly Find[];
  readonly decorations: readonly Decoration[];
}

const STEP_OF: Readonly<Record<Direction, readonly [number, number]>> = {
  down: [0, 1],
  up: [0, -1],
  right: [1, 0],
  left: [-1, 0],
};

export function stepFor(difficulty: number): Step {
  const step = STEPS[difficulty - 1];
  if (!Number.isInteger(difficulty) || step === undefined) {
    throw new RangeError(
      `Trackpad moves has difficulty 1 to ${String(MAX_TRACKPAD_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return step;
}

/** Every move from `from` that stays in the grid: a direction and a distance up to `reach`. */
export function movesFrom(from: ScreenCell, step: Step): { direction: Direction; to: ScreenCell }[] {
  const moves: { direction: Direction; to: ScreenCell }[] = [];
  for (const direction of step.directions) {
    const [dx, dy] = STEP_OF[direction];
    for (let distance = 1; distance <= step.reach; distance += 1) {
      const to = { column: from.column + dx * distance, row: from.row + dy * distance };
      if (to.column >= 0 && to.column < step.columns && to.row >= 0 && to.row < step.rows)
        moves.push({ direction, to });
    }
  }
  return moves;
}

/**
 * Two decorations per screen, in the corners, clear of the middle where hidden things sit. A
 * corner shifts at most 40 units sideways, which keeps a gap from any hidden thing.
 */
function decorate(random: Random, step: Step): Decoration[] {
  const corners = [
    [130, 120],
    [870, 120],
    [130, 480],
    [870, 480],
  ] as const;
  const decorations: Decoration[] = [];
  for (let row = 0; row < step.rows; row += 1) {
    for (let column = 0; column < step.columns; column += 1) {
      for (const [x, y] of random.sample(corners, 2)) {
        decorations.push({
          id: `decor-${String(decorations.length)}`,
          kind: random.pick(DECOR),
          x: column * SCREEN.width + x + random.int(-40, 40),
          y: row * SCREEN.height + y + random.int(-30, 30),
        });
      }
    }
  }
  return decorations;
}

/** Pure: the same seed and difficulty give the same scene. The band does not change it. */
export function generateLevel(seed: number, difficulty: number, _band: Band): TrackpadLevel {
  const step = stepFor(difficulty);
  const random = createRandom(seed);
  // A tall scene starts at the top; a square one starts in the middle, so every way is open.
  const start = { column: Math.floor(step.columns / 2), row: step.columns === 1 ? 0 : Math.floor(step.rows / 2) };
  const kinds = random.sample(THINGS, step.finds);
  const finds: Find[] = [];
  let at: ScreenCell = start;
  for (const [index, kind] of kinds.entries()) {
    // Prefer a screen that holds no earlier find, so two never share a spot. A small grid may
    // have none left; then any move will do, and the earlier find is already tapped.
    const fresh = movesFrom(at, step).filter(
      ({ to }) => !finds.some(({ screen }) => screen.column === to.column && screen.row === to.row),
    );
    const { direction, to } = random.pick(fresh.length > 0 ? fresh : movesFrom(at, step));
    finds.push({
      id: `find-${String(index)}`,
      kind,
      direction,
      screen: to,
      x: random.int(INNER.left, INNER.right),
      y: random.int(INNER.top, INNER.bottom),
    });
    at = to;
  }
  return { columns: step.columns, rows: step.rows, start, finds, decorations: decorate(random, step) };
}
