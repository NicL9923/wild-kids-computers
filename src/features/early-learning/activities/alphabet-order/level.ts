import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';
import { ALPHABET, type Letter } from '../../reading/alphabet.ts';

/**
 * Alphabet order. The easy rounds show a short run of the alphabet, such as a b c, and ask for
 * the letter that comes next. Harder rounds give a few letters out of order to put in order,
 * first neighbors such as d e f, then letters with gaps such as c f k.
 */

type Tier =
  | {
      readonly mode: 'next';
      /** Letters shown before the gap. */
      readonly run: number;
      readonly choices: number;
      /** The last letter the run may start on, as an index into the alphabet. */
      readonly lastStart: number;
      /** Wrong letters sit near the answer, rather than three or more letters away. */
      readonly near: boolean;
    }
  | {
      readonly mode: 'order';
      readonly count: number;
      /** The widest step between neighbors, 1 for letters side by side. */
      readonly maxGap: number;
    };

/** One entry per difficulty, 1 first. */
const TIERS: readonly Tier[] = [
  { mode: 'next', run: 3, choices: 2, lastStart: 5, near: false },
  { mode: 'next', run: 3, choices: 3, lastStart: 12, near: false },
  { mode: 'next', run: 2, choices: 3, lastStart: 23, near: true },
  { mode: 'order', count: 3, maxGap: 1 },
  { mode: 'order', count: 4, maxGap: 1 },
  { mode: 'order', count: 4, maxGap: 3 },
  { mode: 'order', count: 5, maxGap: 3 },
  { mode: 'order', count: 6, maxGap: 3 },
];

export const MAX_DIFFICULTY = TIERS.length;

export type AlphabetOrderLevel =
  | {
      readonly mode: 'next';
      /** The letters shown in order before the gap. */
      readonly run: readonly Letter[];
      /** The letter after the run. */
      readonly answer: Letter;
      /** The letters to pick from, in screen order. */
      readonly choices: readonly Letter[];
    }
  | {
      readonly mode: 'order';
      /** The letters in alphabet order: the order the child puts them in. */
      readonly letters: readonly Letter[];
      /** The same letters as the child first sees them, never already in order. */
      readonly shuffled: readonly Letter[];
    };

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Alphabet order has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

function letterAt(index: number): Letter {
  const letter = ALPHABET[index];
  if (letter === undefined) throw new RangeError(`No letter at ${String(index)}.`);
  return letter;
}

/** How far a near wrong letter may be from the answer, and how far a far one must be. */
export const NEAR = 4;
export const FAR = 3;

function nextRound(random: Random, tier: Extract<Tier, { mode: 'next' }>): AlphabetOrderLevel {
  const start = random.int(0, tier.lastStart);
  const run = Array.from({ length: tier.run }, (_, offset) => letterAt(start + offset));
  const answerIndex = start + tier.run;
  const answer = letterAt(answerIndex);
  const wrong = ALPHABET.filter((letter, index) => {
    if (letter === answer || run.includes(letter)) return false;
    const distance = Math.abs(index - answerIndex);
    return tier.near ? distance <= NEAR : distance >= FAR;
  });
  const choices = random.shuffle([answer, ...random.sample(wrong, tier.choices - 1)]);
  return { mode: 'next', run, answer, choices };
}

function orderRound(random: Random, tier: Extract<Tier, { mode: 'order' }>): AlphabetOrderLevel {
  const gaps = Array.from({ length: tier.count - 1 }, () => random.int(1, tier.maxGap));
  const span = gaps.reduce((sum, gap) => sum + gap, 0);
  let index = random.int(0, ALPHABET.length - 1 - span);
  const letters = [letterAt(index)];
  for (const gap of gaps) {
    index += gap;
    letters.push(letterAt(index));
  }
  let shuffled = random.shuffle(letters);
  // A round that starts in order has nothing to do: turn it one place, which never is.
  if (shuffled.every((letter, position) => letter === letters[position])) {
    shuffled = [...letters.slice(1), ...letters.slice(0, 1)];
  }
  return { mode: 'order', letters, shuffled };
}

/** Pure: the same seed and difficulty give the same round in every band. */
export function generateLevel(seed: number, difficulty: number, _band: Band): AlphabetOrderLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  return tier.mode === 'next' ? nextRound(random, tier) : orderRound(random, tier);
}
