import { createRandom } from '../../../../core/activityKit/random.ts';
import type { Band } from '../../../../core/bands.ts';

/** The parts in the order they join the scene as difficulty rises. The screen is always there. */
export const PARTS = ['screen', 'keyboard', 'mouse', 'speaker', 'trackpad', 'camera'] as const;
export type PartId = (typeof PARTS)[number];

/** The scene in board units. CSS scales the board to the stage. */
export const BOARD = { width: 1000, height: 600 } as const;

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where each part stands. Every part is one clear button, well apart from the others, and the
 * smallest, the camera, is still about one and a half of the youngest band's targets.
 */
export const LAYOUT: Readonly<Record<PartId, Box>> = {
  camera: { x: 430, y: 8, width: 140, height: 86 },
  screen: { x: 300, y: 104, width: 400, height: 280 },
  speaker: { x: 70, y: 110, width: 150, height: 250 },
  keyboard: { x: 270, y: 440, width: 460, height: 124 },
  trackpad: { x: 60, y: 420, width: 170, height: 150 },
  mouse: { x: 790, y: 420, width: 120, height: 150 },
};

/** `name`: the child hears the part's name. `clue`: the child hears what the part does. */
export type PartsMode = 'name' | 'clue';

/** Parts whose job a young child knows from daily life: these are asked by what they do first. */
export const EASY_CLUES: readonly PartId[] = ['screen', 'keyboard', 'speaker'];

/** Per difficulty: how many parts are on the desk, and what the child hears. */
export const DIFFICULTY: readonly {
  readonly parts: number;
  readonly mode: PartsMode;
  readonly targets: 'all' | 'easy';
}[] = [
  { parts: 3, mode: 'name', targets: 'all' },
  { parts: 4, mode: 'name', targets: 'all' },
  { parts: 5, mode: 'name', targets: 'all' },
  { parts: 6, mode: 'name', targets: 'all' },
  { parts: 6, mode: 'clue', targets: 'easy' },
  { parts: 6, mode: 'clue', targets: 'all' },
];

export interface PartsLevel {
  /** The parts on the desk, in the order they join it. */
  readonly parts: readonly PartId[];
  /** The part to find. */
  readonly target: PartId;
  readonly mode: PartsMode;
}

/**
 * A computer on a desk. Difficulty adds one part at a time, then asks by what a part does instead
 * of its name, first for the parts a child sees used every day.
 */
export function generateLevel(seed: number, difficulty: number, _band: Band): PartsLevel {
  const random = createRandom(seed);
  const row = DIFFICULTY[Math.min(Math.max(difficulty, 1), DIFFICULTY.length) - 1] ?? DIFFICULTY[0];
  if (row === undefined) throw new Error('parts-of-a-computer: no difficulty table');
  const parts = PARTS.slice(0, row.parts);
  const pool = row.targets === 'easy' ? parts.filter((part) => EASY_CLUES.includes(part)) : parts;
  return { parts, target: random.pick(pool), mode: row.mode };
}
