import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';
import { ANIMALS, livesIn, type Animal, type Home } from './homes.ts';

/**
 * Animal homes: a few animals and a few homes. The child takes each animal to where it lives.
 * Difficulty adds pairs and then brings in animals young children know less well, such as a
 * bat in a cave. Every animal fits exactly one home on screen.
 */

interface Tier {
  readonly pairs: number;
  readonly familiarOnly: boolean;
}

/** One entry per difficulty, 1 first. */
const TIERS: readonly Tier[] = [
  { pairs: 2, familiarOnly: true },
  { pairs: 3, familiarOnly: true },
  { pairs: 3, familiarOnly: false },
  { pairs: 4, familiarOnly: true },
  { pairs: 4, familiarOnly: false },
  { pairs: 5, familiarOnly: false },
];

export const MAX_DIFFICULTY = TIERS.length;

export interface AnimalHomesLevel {
  /** The animals in screen order. */
  readonly animals: readonly Animal[];
  /**
   * The homes in screen order, one per animal. The animals are in any order at all, so an animal
   * is as likely over its own home as over any other, and position never gives the match away.
   */
  readonly homes: readonly Home[];
}

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Animal homes has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

/**
 * One animal per home, each fitting only its own home among `homes`, or null when some home has
 * no such animal. Animals are tried in random order.
 */
export function animalsFor(random: Random, homes: readonly Home[], familiarOnly: boolean): Animal[] | null {
  const chosen: Animal[] = [];
  for (const home of homes) {
    const fits = random
      .shuffle(ANIMALS)
      .find(
        (animal) =>
          animal.home === home &&
          (animal.familiar || !familiarOnly) &&
          homes.every((other) => other === home || !livesIn(animal, other)),
      );
    if (fits === undefined) return null;
    chosen.push(fits);
  }
  return chosen;
}

const ATTEMPTS = 200;

/** Pure: the same seed and difficulty give the same round in every band. */
export function generateLevel(seed: number, difficulty: number, _band: Band): AnimalHomesLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const allHomes = [...new Set(ANIMALS.map((animal) => animal.home))];
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const homes = random.sample(allHomes, tier.pairs);
    const animals = animalsFor(random, homes, tier.familiarOnly);
    if (animals === null) continue;
    return { animals: random.shuffle(animals), homes };
  }
  throw new Error(`Animal homes found no fair round at difficulty ${String(difficulty)}.`);
}
