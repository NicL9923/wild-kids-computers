import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import { makeScene, type Scene } from '../../logic/scene.ts';

/**
 * Jigsaw: a picture cut into rectangles, and a tray of the pieces in a mixed order. The child puts
 * each piece in its place on the board. The picture is a bundled scene, or in about half the
 * rounds one of the child's own paintings when the gallery has one that is fit to cut; the scene
 * is always there as the fallback.
 *
 * Difficulty adds pieces a few at a time, and at the low end the board shows a faint copy of the
 * picture, so a piece's place can be found by matching.
 */

/** The size of a picture in scene units: the paint studio's 16 by 10 canvas. */
export const PICTURE = { width: 1600, height: 1000 } as const;

interface Tier {
  readonly columns: number;
  readonly rows: number;
  /** True when the board shows a faint copy of the picture to match against. */
  readonly guide: boolean;
}

/** One entry per difficulty, 1 first. Each step adds a few pieces or takes the guide away. */
const TIERS: readonly Tier[] = [
  { columns: 2, rows: 1, guide: true },
  { columns: 2, rows: 2, guide: true },
  { columns: 2, rows: 2, guide: false },
  { columns: 3, rows: 2, guide: true },
  { columns: 3, rows: 2, guide: false },
  { columns: 3, rows: 3, guide: false },
  { columns: 4, rows: 3, guide: false },
  { columns: 4, rows: 4, guide: false },
  { columns: 5, rows: 4, guide: false },
  { columns: 6, rows: 4, guide: false },
];

export const MAX_DIFFICULTY = TIERS.length;

export interface JigsawLevel {
  readonly columns: number;
  readonly rows: number;
  readonly guide: boolean;
  /** The bundled picture, used when the round does not use a painting or none is fit to cut. */
  readonly scene: Scene;
  /**
   * Where in the gallery to take a painting from, as a fraction of the list, or null to use the
   * scene. A fraction keeps the level pure: the gallery is only known when the round starts.
   */
  readonly gallery: number | null;
  /** The pieces in the tray, by home index counted row by row. Never all in home order. */
  readonly tray: readonly number[];
}

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Jigsaw has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

/** Pure: the same seed and difficulty give the same pieces and choice of picture. The band does not change it. */
export function generateLevel(seed: number, difficulty: number, _band: Band): JigsawLevel {
  const { columns, rows, guide } = tierFor(difficulty);
  const random = createRandom(seed);
  // At least 3 by 2 pictures, so even two pieces each show a few things.
  const scene = makeScene(random, PICTURE.width, PICTURE.height, Math.max(columns, 3), Math.max(rows, 2));
  const gallery = random.next() < 0.5 ? random.next() : null;
  const home = Array.from({ length: columns * rows }, (_, index) => index);
  let tray = random.shuffle(home);
  // A tray in home order would hand the answer over; turning it around never is.
  if (tray.every((piece, index) => piece === index)) tray = tray.toReversed();
  return { columns, rows, guide, scene, gallery, tray };
}
