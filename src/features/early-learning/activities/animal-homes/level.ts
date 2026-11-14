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
  /** The homes in screen order, one per animal, never lined up under its own animal. */
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

/** The animals in an order where none sits right over its own home. */
export function animalOrder(random: Random, animals: readonly Animal[], homes: readonly Home[]): Animal[] {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const order = random.shuffle(animals);
    if (order.every((animal, index) => animal.home !== homes[index])) return order;
  }
  // `animals` follows `homes`, so a turn by one place moves every animal off its home.
  return [...animals.slice(1), ...animals.slice(0, 1)];
}

/** Pure: the same seed and difficulty give the same round in every band. */
export function generateLevel(seed: number, difficulty: number, _band: Band): AnimalHomesLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const allHomes = [...new Set(ANIMALS.map((animal) => animal.home))];
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const homes = random.sample(allHomes, tier.pairs);
    const animals = animalsFor(random, homes, tier.familiarOnly);
    if (animals === null) continue;
    // No home sits right under its own animal, so position never gives the match away.
    return { animals: animalOrder(random, animals, homes), homes };
  }
  throw new Error(`Animal homes found no fair round at difficulty ${String(difficulty)}.`);
}
