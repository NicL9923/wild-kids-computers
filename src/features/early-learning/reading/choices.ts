import type { Random } from '../../../core/activityKit/random.ts';

/**
 * Picks the wrong answers for a choice round. Every letters and reading activity that offers a
 * row of choices builds it here, so the fairness rules live in one place:
 *
 * - The answer appears exactly once.
 * - No choice clashes with another: two choices that would both be right, such as c and k for
 *   the sound "kuh", or "to" and "two" for a spoken word, never share a round.
 * - With `similar` 0, no wrong answer is easy to mix up with the answer. With `similar` above 0,
 *   that many are, when the pool has them, which is what makes a harder round harder.
 */
export interface ChoiceRules<T> {
  /** Everything a choice can be. The answer may be in it or not. */
  readonly pool: readonly T[];
  /** How many choices the round shows, the answer included. */
  readonly total: number;
  /** True when two choices would both be right. */
  readonly clashes: (a: T, b: T) => boolean;
  /** True when a wrong answer is easy to mix up with the answer. */
  readonly confusable: (answer: T, other: T) => boolean;
  /** How many wrong answers should be easy to mix up with the answer. */
  readonly similar: number;
}

/** Adds items from `from` to `into` in order, skipping any that clash with one already in. */
function addWithoutClash<T>(into: T[], from: readonly T[], limit: number, clashes: (a: T, b: T) => boolean): void {
  for (const item of from) {
    if (into.length >= limit) return;
    if (into.every((already) => !clashes(already, item))) into.push(item);
  }
}

/**
 * The answer and its wrong answers in a shuffled order. Throws when the pool cannot fill the
 * round, which is a mistake in an activity's tables, never a child's.
 */
export function chooseWithAnswer<T>(random: Random, answer: T, rules: ChoiceRules<T>): T[] {
  const { pool, total, clashes, confusable, similar } = rules;
  const others = random.shuffle(pool.filter((item) => item !== answer && !clashes(answer, item)));
  const near = others.filter((item) => confusable(answer, item));
  const far = others.filter((item) => !confusable(answer, item));
  const chosen: T[] = [answer];
  addWithoutClash(chosen, near, 1 + similar, clashes);
  addWithoutClash(chosen, far, total, clashes);
  if (chosen.length < total) {
    throw new RangeError(`Only ${String(chosen.length)} fair choices for ${String(answer)}, not ${String(total)}.`);
  }
  return random.shuffle(chosen);
}
