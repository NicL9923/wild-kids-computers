/**
 * Where a level puts each item's answer, for checking that a child cannot succeed by position.
 * `positions[i]` is the screen place, from 0 to `slots - 1`, where the i-th item on screen
 * belongs: its hole, its home, its place on the board, or the one right choice.
 */
export interface AnswerPlaces {
  readonly positions: readonly number[];
  /** How many places there are. Defaults to one per item, as when items and places pair up. */
  readonly slots?: number;
}

/**
 * Fails when the right place can be told from screen order alone. Over `seeds`, each item must
 * land on each place at least a third as often as chance, so no rule such as "always crossed",
 * "never straight down", or "the first one" holds. Levels of different sizes are counted apart.
 * Give enough seeds that chance puts each item in each place a few dozen times.
 */
export function expectNoPositionTell(seeds: readonly number[], answer: (seed: number) => AnswerPlaces): void {
  const tallies = new Map<string, { slots: number; items: number; seen: number; counts: number[] }>();
  for (const seed of seeds) {
    const { positions, slots = positions.length } = answer(seed);
    if (positions.some((place) => !Number.isInteger(place) || place < 0 || place >= slots)) {
      throw new RangeError(`Seed ${String(seed)} put an answer outside 0 to ${String(slots - 1)}: ${positions.join()}`);
    }
    const key = `${String(positions.length)} in ${String(slots)}`;
    const tally = tallies.get(key) ?? { slots, items: positions.length, seen: 0, counts: [] };
    tallies.set(key, tally);
    tally.seen += 1;
    positions.forEach((place, item) => {
      tally.counts[item * slots + place] = (tally.counts[item * slots + place] ?? 0) + 1;
    });
  }
  const tells: string[] = [];
  for (const [key, { slots, items, seen, counts }] of tallies) {
    const least = seen / slots / 3;
    for (let item = 0; item < items; item += 1) {
      for (let place = 0; place < slots; place += 1) {
        const count = counts[item * slots + place] ?? 0;
        if (count < least) {
          tells.push(
            `${key}: item ${String(item)} went to place ${String(place)} ${String(count)} of ${String(seen)} times`,
          );
        }
      }
    }
  }
  if (tells.length > 0) throw new Error(`Position gives the answer away:\n${tells.join('\n')}`);
}
