import { MAX_DIFFICULTY, MIN_DIFFICULTY, type ActivityProgress, type RoundOutcome } from '../storage/schemas.ts';

/**
 * The difficulty model. Pure: it reads recent rounds and returns the next level.
 *
 * - It raises the level by one after CLEAN_ROUNDS_TO_RAISE clean rounds in a row played at the
 *   current level. A clean round has no mistakes and no hints.
 * - It lowers the level by one right after a round with STRUGGLE_THRESHOLD or more mistakes and
 *   hints together, so a child who struggles gets help at once.
 * - It moves one step at a time, so a child never notices a jump, and never leaves the range the
 *   activity gives for the band.
 */

/** The lowest and highest level an activity offers in one band, on the 1 to 10 scale. */
export interface DifficultyRange {
  readonly min: number;
  readonly max: number;
}

/** Clean rounds in a row at one level before the level goes up. */
export const CLEAN_ROUNDS_TO_RAISE = 2;
/** Mistakes plus hints in one round at which the level goes down. */
export const STRUGGLE_THRESHOLD = 3;

/** Throws when a range is not whole numbers with 1 <= min <= max <= 10. */
export function assertDifficultyRange(range: DifficultyRange, where = 'A difficulty range'): void {
  const { min, max } = range;
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new RangeError(`${where} needs whole numbers, not ${String(min)} to ${String(max)}.`);
  }
  if (min < MIN_DIFFICULTY || max > MAX_DIFFICULTY) {
    throw new RangeError(
      `${where} must stay within ${String(MIN_DIFFICULTY)} to ${String(MAX_DIFFICULTY)}, not ${String(min)} to ${String(max)}.`,
    );
  }
  if (min > max) throw new RangeError(`${where} has min above max: ${String(min)} to ${String(max)}.`);
}

/** Brings a level into the range. A level saved for another band, or a test's level, lands on the nearest end. */
export function clampDifficulty(level: number, range: DifficultyRange): number {
  assertDifficultyRange(range);
  if (!Number.isFinite(level)) return range.min;
  return Math.min(range.max, Math.max(range.min, Math.round(level)));
}

/** The level to start at: the saved one when there is one, otherwise the lowest of the range. */
export function startingDifficulty(progress: ActivityProgress | undefined, range: DifficultyRange): number {
  return clampDifficulty(progress?.difficulty ?? range.min, range);
}

function isClean(round: Pick<RoundOutcome, 'mistakes' | 'hintsUsed'>): boolean {
  return round.mistakes === 0 && round.hintsUsed === 0;
}

function struggled(round: Pick<RoundOutcome, 'mistakes' | 'hintsUsed'>): boolean {
  return round.mistakes + round.hintsUsed >= STRUGGLE_THRESHOLD;
}

/**
 * The level for the next round. `rounds` is the recent history, oldest first, ending with the
 * round just played. Each round's `level` says where it was played; a round without one never
 * counts toward a raise.
 */
export function nextDifficulty(
  current: number,
  rounds: readonly Pick<RoundOutcome, 'mistakes' | 'hintsUsed' | 'level'>[],
  range: DifficultyRange,
): number {
  const level = clampDifficulty(current, range);
  const last = rounds.at(-1);
  if (last === undefined) return level;
  if (struggled(last)) return Math.max(range.min, level - 1);

  const recent = rounds.slice(-CLEAN_ROUNDS_TO_RAISE);
  const ready = recent.length === CLEAN_ROUNDS_TO_RAISE && recent.every((r) => r.level === level && isClean(r));
  return ready ? Math.min(range.max, level + 1) : level;
}
