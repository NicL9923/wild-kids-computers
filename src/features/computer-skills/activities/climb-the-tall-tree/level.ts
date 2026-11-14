import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Climb the tall tree: a tree much taller than the window, with animals on its branches. The
 * child starts at the ground and scrolls up to find the animal in the picture, then the next.
 * Every animal to find sits above the first screen, so finding it takes a scroll. Difficulty
 * makes the tree taller and adds animals and things to find.
 *
 * The tree is 1000 units wide and `height` units tall. The window onto it always shows
 * VIEW_HEIGHT units of it, so a level knows what is in the first screen at any window size.
 */

export const TREE_WIDTH = 1000;

/** How much of the tree the window shows at once, top to bottom, in tree units. */
export const VIEW_HEIGHT = 700;

/** The trunk runs up the middle, between these two edges. */
export const TRUNK = { left: 440, right: 560 } as const;

/** Space kept clear at the top of the tree and above the ground. */
export const TOP_MARGIN = 60;
export const GROUND = 110;

/** Wrong animals for one find before the way to scroll is shown and said, as a hint. */
export const TRIES_BEFORE_HINT = 2;

/** The wait after the last find, so the child sees it before the round ends. */
export const FOUND_PAUSE_MS = 1200;

export const ANIMALS = [
  'owl',
  'bird',
  'parrot',
  'monkey',
  'koala',
  'sloth',
  'cat',
  'raccoon',
  'bat',
  'butterfly',
  'bee',
  'snail',
  'caterpillar',
  'ladybug',
  'dove',
] as const satisfies readonly EmojiId[];

type Animal = (typeof ANIMALS)[number];

export interface Perch {
  readonly id: string;
  readonly animal: Animal;
  /** The center, in tree units from the top left. */
  readonly x: number;
  readonly y: number;
}

export interface TreeLevel {
  readonly height: number;
  readonly perches: readonly Perch[];
  /** The perches to find, in order. */
  readonly finds: readonly string[];
  /** The size of every animal, in tree units. */
  readonly size: number;
}

export interface Step {
  readonly height: number;
  readonly animals: number;
  readonly finds: number;
  readonly size: number;
}

/** One entry per difficulty, 1 first: a taller tree with more animals and more to find. */
export const STEPS: readonly Step[] = [
  { height: 1400, animals: 3, finds: 1, size: 150 },
  { height: 1700, animals: 4, finds: 1, size: 140 },
  { height: 2000, animals: 5, finds: 2, size: 130 },
  { height: 2300, animals: 6, finds: 2, size: 120 },
  { height: 2600, animals: 7, finds: 3, size: 110 },
  { height: 2900, animals: 8, finds: 3, size: 100 },
];

export const MAX_TREE_DIFFICULTY = STEPS.length;

/** How far an animal moves up or down inside its share of the tree. */
const NUDGE = 40;

/** The step for a difficulty. Throws outside 1 to MAX_TREE_DIFFICULTY. */
export function stepFor(difficulty: number): Step {
  const step = STEPS[difficulty - 1];
  if (!Number.isInteger(difficulty) || step === undefined) {
    throw new RangeError(
      `Climb the tall tree has difficulty 1 to ${String(MAX_TREE_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return step;
}

/** Whether a perch is out of sight from the ground: wholly above the first screen. */
export function aboveFirstScreen(level: Pick<TreeLevel, 'height' | 'size'>, perch: Pick<Perch, 'y'>): boolean {
  return perch.y + level.size / 2 <= level.height - VIEW_HEIGHT;
}

/**
 * Pure: the same seed and difficulty give the same tree. Each animal has its own share of the
 * tree's height, on branches that take turns left and right of the trunk.
 */
export function generateLevel(seed: number, difficulty: number, _band: Band): TreeLevel {
  const step = stepFor(difficulty);
  const random = createRandom(seed);
  const animals = random.sample(ANIMALS, step.animals);
  const share = (step.height - TOP_MARGIN - GROUND) / step.animals;
  const firstLeft = random.next() < 0.5;
  const reach = step.size / 2 + 20;
  const perches = animals.map((animal, index) => {
    const left = (index % 2 === 0) === firstLeft;
    const x = left ? random.int(reach, TRUNK.left - reach) : random.int(TRUNK.right + reach, TREE_WIDTH - reach);
    return {
      id: `perch-${String(index)}`,
      animal,
      x,
      y: Math.round(TOP_MARGIN + (index + 0.5) * share) + random.int(-NUDGE, NUDGE),
    };
  });
  const level = { height: step.height, size: step.size };
  const hidden = perches.filter((perch) => aboveFirstScreen(level, perch)).map((perch) => perch.id);
  return { ...level, perches, finds: random.sample(hidden, step.finds) };
}

/** Which way to scroll to bring a perch into a window whose top is at `scrollTop`, in tree units. */
export function directionTo(perch: Pick<Perch, 'y'>, scrollTop: number): 'up' | 'down' | 'here' {
  if (perch.y < scrollTop) return 'up';
  if (perch.y > scrollTop + VIEW_HEIGHT) return 'down';
  return 'here';
}
