import type { Random } from '../../../core/activityKit/random.ts';

/**
 * Scattered things for a group to count. The board is 400 by 360 units, nearly square so three
 * boards side by side still use the height, and scales to fit its card. Spots are centers. Things keep a little space between them, so none touch.
 */
export const SCATTER_BOARD = { width: 400, height: 360 } as const;

export interface Spot {
  readonly x: number;
  readonly y: number;
}

/** Things keep a sixth of their size between them. */
const SPACING = 1.16;
const SPOT_ATTEMPTS = 120;
const LAYOUT_TRIES = 12;

/**
 * The width of each thing on the board, smaller when there are more to fit. Each size is a few
 * units under the largest that fit in 600 trial layouts, so a scatter almost never falls back.
 */
export function scatterSize(count: number): number {
  if (count <= 5) return 100;
  if (count <= 10) return 72;
  if (count <= 15) return 58;
  return 52;
}

/** `count` spots that do not touch, or null when they do not all fit after a few tries. */
export function scatterSpots(random: Random, count: number, size: number): Spot[] | null {
  for (let attempt = 0; attempt < LAYOUT_TRIES; attempt += 1) {
    const spots = tryLayout(random, count, size);
    if (spots !== null) return spots;
  }
  return null;
}

function tryLayout(random: Random, count: number, size: number): Spot[] | null {
  const spots: Spot[] = [];
  const radius = Math.ceil(size / 2);
  for (let index = 0; index < count; index += 1) {
    let found: Spot | null = null;
    for (let attempt = 0; attempt < SPOT_ATTEMPTS && found === null; attempt += 1) {
      const spot = {
        x: random.int(radius, SCATTER_BOARD.width - radius),
        y: random.int(radius, SCATTER_BOARD.height - radius),
      };
      if (spots.every((other) => Math.hypot(spot.x - other.x, spot.y - other.y) >= size * SPACING)) found = spot;
    }
    if (found === null) return null;
    spots.push(found);
  }
  return spots;
}
