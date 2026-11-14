import type { Random } from '../../../core/activityKit/random.ts';

/**
 * Number choices for the math activities. A level offers the answer once and wrong choices
 * that are near it, so a child who counts or reasons carefully can tell them apart, and a guess
 * is not rewarded by an answer that stands out.
 */

/** The whole numbers within `spread` of `answer`, other than the answer, from `min` to `max`. */
export function nearby(answer: number, spread: number, min: number, max: number): number[] {
  const found: number[] = [];
  for (let value = answer - spread; value <= answer + spread; value += 1) {
    if (value !== answer && value >= min && value <= max) found.push(value);
  }
  return found;
}

/**
 * The answer and `total - 1` wrong choices, smallest first. Wrong choices come from the first
 * pool, such as the mistake children make most, then from the next pool, and so on; within a
 * pool they are drawn at random. A candidate equal to the answer or to an earlier candidate is
 * dropped, so the answer is offered exactly once. Throws when the pools cannot fill the row.
 */
export function pickChoices(
  random: Random,
  answer: number,
  total: number,
  ...pools: readonly (readonly number[])[]
): number[] {
  const wanted = total - 1;
  const taken = new Set([answer]);
  const wrong: number[] = [];
  for (const pool of pools) {
    const fresh = [...new Set(pool)].filter((value) => !taken.has(value));
    for (const value of fresh) taken.add(value);
    wrong.push(...random.sample(fresh, Math.min(wanted - wrong.length, fresh.length)));
  }
  if (wrong.length < wanted) {
    throw new RangeError(
      `${String(total)} choices for ${String(answer)} need ${String(wanted)} other numbers, found ${String(wrong.length)}.`,
    );
  }
  return [answer, ...wrong].toSorted((a, b) => a - b);
}
