import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Pack the picnic: food waits on the grass on the left, and the child moves each piece to the
 * right. At first every piece goes in one big basket. Later each piece has its own place on a
 * picnic blanket, shown by its shadow, so the child places it with more care.
 *
 * The scene is 1000 by 600 units and scales to fit. Food sits in the left part and the places in
 * the right part, so every move crosses the middle and is a real carry.
 */

export const SCENE = { width: 1000, height: 600 } as const;

/** Food starts in this part of the scene. */
export const GRASS = { left: 40, right: 440, top: 40, bottom: 560 } as const;
/** The basket or the blanket sits in this part. */
export const BLANKET = { left: 540, right: 960, top: 60, bottom: 540 } as const;

/** The wait after the last piece lands, so the child sees the picnic packed. */
export const PACKED_PAUSE_MS = 1200;

/** Wrong places for one piece before its own place lights up, as a hint. */
export const TRIES_BEFORE_HINT = 2;

export const FOODS = [
  'apple',
  'banana',
  'sandwich',
  'cheese',
  'strawberry',
  'watermelon',
  'grapes',
  'carrot',
  'pear',
  'orange',
  'cookie',
  'cupcake',
] as const satisfies readonly EmojiId[];

export type Food = (typeof FOODS)[number];

export interface Piece {
  readonly id: string;
  readonly food: Food;
  /** Where it waits on the grass: its center, in scene units. */
  readonly x: number;
  readonly y: number;
}

export interface Place {
  readonly id: string;
  /** The piece that belongs here, or null when anything goes, as in the basket. */
  readonly takes: string | null;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export interface PicnicLevel {
  readonly mode: 'basket' | 'spots';
  readonly pieces: readonly Piece[];
  readonly places: readonly Place[];
  /** The size of every piece of food, in scene units. */
  readonly size: number;
}

export interface Step {
  readonly mode: PicnicLevel['mode'];
  readonly count: number;
  readonly size: number;
}

/** One entry per difficulty, 1 first: more food, a little smaller, then a place for each. */
export const STEPS: readonly Step[] = [
  { mode: 'basket', count: 2, size: 150 },
  { mode: 'basket', count: 3, size: 140 },
  { mode: 'basket', count: 4, size: 130 },
  { mode: 'spots', count: 2, size: 130 },
  { mode: 'spots', count: 3, size: 120 },
  { mode: 'spots', count: 4, size: 110 },
  { mode: 'spots', count: 5, size: 100 },
  { mode: 'spots', count: 6, size: 90 },
];

export const MAX_PICNIC_DIFFICULTY = STEPS.length;

/** The basket's size and center. */
export const BASKET = { x: 750, y: 330, size: 300 } as const;

/** A place on the blanket is this much bigger than the food, so there is room to land it. */
const SPOT_ROOM = 24;

/** The step for a difficulty. Throws outside 1 to MAX_PICNIC_DIFFICULTY. */
export function stepFor(difficulty: number): Step {
  const step = STEPS[difficulty - 1];
  if (!Number.isInteger(difficulty) || step === undefined) {
    throw new RangeError(
      `Pack the picnic has difficulty 1 to ${String(MAX_PICNIC_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return step;
}

type Area = { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };

/**
 * Centers of `count` cells in a grid over an area: two columns up to four, then three. Each center
 * moves by up to `nudge` units, so layouts differ while cells keep their room.
 */
export function gridIn(random: Random, area: Area, count: number, nudge: number): { x: number; y: number }[] {
  const columns = count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / columns);
  const cellWidth = (area.right - area.left) / columns;
  const cellHeight = (area.bottom - area.top) / rows;
  return Array.from({ length: count }, (_, index) => ({
    x: Math.round(area.left + ((index % columns) + 0.5) * cellWidth) + random.int(-nudge, nudge),
    y: Math.round(area.top + (Math.floor(index / columns) + 0.5) * cellHeight) + random.int(-nudge, nudge),
  }));
}

/** Pure: the same seed and difficulty give the same picnic. The band does not change it. */
export function generateLevel(seed: number, difficulty: number, _band: Band): PicnicLevel {
  const step = stepFor(difficulty);
  const random = createRandom(seed);
  const foods = random.sample(FOODS, step.count);
  const pieces = gridIn(random, GRASS, step.count, 12).map((spot, index) => ({
    id: `piece-${String(index)}`,
    food: foods[index] ?? FOODS[0],
    ...spot,
  }));
  if (step.mode === 'basket') {
    return { mode: 'basket', pieces, places: [{ id: 'basket', takes: null, ...BASKET }], size: step.size };
  }
  // Places are laid out on the blanket in another order than the food on the grass.
  const order = random.shuffle(pieces.map((piece) => piece.id));
  const places = gridIn(random, BLANKET, step.count, 4).map((spot, index) => ({
    id: `place-${String(index)}`,
    takes: order[index] ?? null,
    size: step.size + SPOT_ROOM,
    ...spot,
  }));
  return { mode: 'spots', pieces, places, size: step.size };
}

/** Whether a piece belongs in a place. */
export function belongs(place: Pick<Place, 'takes'>, pieceId: string): boolean {
  return place.takes === null || place.takes === pieceId;
}
