import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Zoom explorer: a big meadow picture with a few tiny things in it. The child zooms in until the
 * things are big enough to catch, clicks the ones that match, and zooms back out. Difficulty
 * makes the things smaller, so they need more zoom, adds more of them to find, and adds more tiny
 * things that are not the one asked for.
 *
 * The picture is 1000 by 600 units at zoom 1 and scales to fit. A tiny thing can be caught when
 * it shows at CATCH_SIZE units or more, which is at least the band's smallest target at a 1280
 * by 800 window.
 */

export const SCENE = { width: 1000, height: 600 } as const;

/** The zoom levels, from the whole picture to six times closer. */
export const ZOOM_STEPS: readonly number[] = [1, 1.5, 2, 3, 4, 6];

/** How big, in units at the current zoom, a tiny thing must show before a click catches it. */
export const CATCH_SIZE = 60;

/** Space between a tiny thing and the edge of the picture. */
export const EDGE_MARGIN = 40;
/** Tiny things keep this many of their own sizes between their centers, so none is crowded. */
export const SPACING = 4;

/** Small things to look for. Each is a clear shape at any size. */
export const TINY = [
  'ladybug',
  'bee',
  'ant',
  'snail',
  'butterfly',
  'caterpillar',
  'feather',
  'key',
  'shell',
  'strawberry',
  'cherries',
  'clover',
  'frog',
  'chick',
  'mouse',
  'bird',
] as const satisfies readonly EmojiId[];

/** The big pieces of the meadow, behind the tiny things. */
const SCENERY = [
  'tree',
  'pine-tree',
  'house',
  'sunflower',
  'tulip',
  'rock',
  'mushroom',
  'seedling',
] as const satisfies readonly EmojiId[];

interface Step {
  /** How many of the asked-for thing to find. */
  readonly targets: number;
  /** Size of every tiny thing, in units at zoom 1. */
  readonly size: number;
  /** Tiny things that are not the one asked for. */
  readonly others: number;
}

/** One entry per difficulty, 1 first. Each step changes one thing. */
export const STEPS: readonly Step[] = [
  { targets: 1, size: 34, others: 3 },
  { targets: 1, size: 26, others: 4 },
  { targets: 2, size: 26, others: 4 },
  { targets: 2, size: 22, others: 6 },
  { targets: 2, size: 17, others: 6 },
  { targets: 3, size: 17, others: 8 },
  { targets: 3, size: 13, others: 8 },
  { targets: 3, size: 11, others: 10 },
];

export const MAX_ZOOM_DIFFICULTY = STEPS.length;

/** The pause after the picture is all the way out again. */
export const ZOOMED_OUT_MS = 900;

export interface Thing {
  readonly id: string;
  readonly kind: (typeof TINY)[number];
  /** The center, in units at zoom 1. */
  readonly x: number;
  readonly y: number;
  readonly isTarget: boolean;
}

interface Piece {
  readonly kind: (typeof SCENERY)[number];
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export interface ZoomLevel {
  readonly target: (typeof TINY)[number];
  /** Every tiny thing, the ones to find and the others, in reading order. */
  readonly things: readonly Thing[];
  readonly size: number;
  /** The first zoom step at which a tiny thing can be caught. */
  readonly catchStep: number;
  readonly scenery: readonly Piece[];
}

function stepFor(difficulty: number): Step {
  const step = STEPS[difficulty - 1];
  if (!Number.isInteger(difficulty) || step === undefined) {
    throw new RangeError(
      `Zoom explorer has difficulty 1 to ${String(MAX_ZOOM_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return step;
}

/** Whether a thing of `size` shows big enough to catch at zoom step `zoomStep`. */
export function canCatch(size: number, zoomStep: number): boolean {
  return size * (ZOOM_STEPS[zoomStep] ?? 0) >= CATCH_SIZE;
}

/** The first zoom step that makes a thing of `size` big enough to catch, or -1 if none does. */
export function catchStepFor(size: number): number {
  return ZOOM_STEPS.findIndex((_, index) => canCatch(size, index));
}

/** Slots for the big scenery, spread over the ground, as [x, y, size]. */
const SCENERY_SLOTS: readonly (readonly [number, number, number])[] = [
  [120, 400, 170],
  [330, 470, 120],
  [520, 380, 190],
  [720, 470, 130],
  [880, 390, 170],
];

const SPOT_ATTEMPTS = 400;

/** Random spots for `count` things that keep their spacing, or a grid when random spots run out. */
export function placeThings(random: Random, count: number, size: number): { x: number; y: number }[] {
  const gap = size * SPACING;
  const spots: { x: number; y: number }[] = [];
  for (let attempt = 0; attempt < SPOT_ATTEMPTS && spots.length < count; attempt += 1) {
    const x = random.int(EDGE_MARGIN, SCENE.width - EDGE_MARGIN);
    const y = random.int(EDGE_MARGIN, SCENE.height - EDGE_MARGIN);
    if (spots.every((spot) => Math.hypot(spot.x - x, spot.y - y) >= gap)) spots.push({ x, y });
  }
  if (spots.length === count) return spots;
  // A grid of five across always has room: the widest gap needed is 4 x 34 = 136 units.
  return Array.from({ length: count }, (_, index) => ({
    x: 100 + (index % 5) * 200,
    y: 100 + Math.floor(index / 5) * 200,
  }));
}

/** Pure: the same seed and difficulty give the same picture. The band does not change it. */
export function generateLevel(seed: number, difficulty: number, _band: Band): ZoomLevel {
  const step = stepFor(difficulty);
  const random = createRandom(seed);
  const target = random.pick(TINY);
  const others = random.sample(
    TINY.filter((kind) => kind !== target),
    step.others,
  );
  const kinds = random.shuffle([...Array.from({ length: step.targets }, () => target), ...others]);
  const spots = placeThings(random, kinds.length, step.size);
  // Spots and kinds have the same length; the spare spot only satisfies the type checker.
  const things = kinds
    .map((kind, index) => ({ ...(spots[index] ?? { x: 0, y: 0 }), kind }))
    // Reading order, so Tab goes left to right and top to bottom.
    .toSorted((a, b) => a.y - b.y || a.x - b.x)
    .map((thing, index) => ({ id: `thing-${String(index)}`, ...thing, isTarget: thing.kind === target }));
  const scenery = random
    .shuffle(SCENERY)
    .slice(0, SCENERY_SLOTS.length)
    .map((kind, index) => {
      const [x, y, size] = SCENERY_SLOTS[index] ?? [0, 0, 0];
      return { kind, x: x + random.int(-30, 30), y: y + random.int(-20, 20), size };
    });
  return { target, things, size: step.size, catchStep: catchStepFor(step.size), scenery };
}
