import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Any key party: every key press brings one friend into the meadow. There is no wrong key.
 * Difficulty is how many presses fill the meadow, so a round stays short for a child who is
 * just finding the keys, and grows a little as they keep going.
 *
 * The meadow is 1000 by 600 units and scales to fit. Friends sit in the cells of a grid with a
 * little jitter, so they never cover each other.
 */

export const MEADOW = { width: 1000, height: 600 } as const;

/** Presses per round, one entry per difficulty, 1 first. */
export const PRESSES: readonly number[] = [4, 5, 6, 8];

export const MAX_PARTY_DIFFICULTY = PRESSES.length;

/** The pause after the last friend arrives, so the child sees the full meadow. */
export const FULL_MEADOW_MS = 1400;

/** Friendly faces only: nothing scary, nothing to eat. */
export const FRIENDS = [
  'dog',
  'cat',
  'rabbit',
  'panda',
  'koala',
  'frog',
  'chick',
  'duck',
  'penguin',
  'owl',
  'turtle',
  'ladybug',
  'butterfly',
  'bee',
  'snail',
  'fox',
  'elephant',
  'giraffe',
  'whale',
  'sunflower',
  'tulip',
  'balloon',
  'rainbow',
  'sun',
] as const satisfies readonly EmojiId[];

/** The grid friends sit in: four across, two down, which holds the largest round. */
export const GRID = { columns: 4, rows: 2 } as const;
/** A friend's size in units, and how far it may shift from the middle of its cell. */
export const FRIEND_SIZE = 180;
export const JITTER = 30;

export interface Friend {
  readonly id: string;
  readonly emoji: (typeof FRIENDS)[number];
  /** The center, in meadow units. */
  readonly x: number;
  readonly y: number;
}

export interface PartyLevel {
  /** The friends in the order they arrive, one per key press. */
  readonly friends: readonly Friend[];
}

export function pressesFor(difficulty: number): number {
  const presses = PRESSES[difficulty - 1];
  if (!Number.isInteger(difficulty) || presses === undefined) {
    throw new RangeError(
      `Any key party has difficulty 1 to ${String(MAX_PARTY_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return presses;
}

/** Pure: the same seed and difficulty give the same friends in the same places. */
export function generateLevel(seed: number, difficulty: number, _band: Band): PartyLevel {
  const count = pressesFor(difficulty);
  const random = createRandom(seed);
  const cells = Array.from({ length: GRID.columns * GRID.rows }, (_, index) => index);
  const cellWidth = MEADOW.width / GRID.columns;
  const cellHeight = MEADOW.height / GRID.rows;
  const places = random.sample(cells, count);
  const kinds = random.sample(FRIENDS, count);
  const friends = places.map((cell, index) => ({
    id: `friend-${String(index)}`,
    emoji: kinds[index] ?? 'dog',
    x: Math.round((cell % GRID.columns) * cellWidth + cellWidth / 2 + random.int(-JITTER, JITTER)),
    y: Math.round(Math.floor(cell / GRID.columns) * cellHeight + cellHeight / 2 + random.int(-JITTER, JITTER)),
  }));
  return { friends };
}
