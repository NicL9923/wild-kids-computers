import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import { emojiNames } from '../../../../core/strings/shared/index.ts';
import activity from './activity.ts';
import {
  binOf,
  CARD_COUNTS,
  FACTS,
  generateLevel,
  kindOf,
  strengthOf,
  type FactId,
  type SecretsLevel,
  type Strength,
} from './level.ts';

const SEEDS = Array.from({ length: 200 }, (_, index) => index * 7_919 + 11);
const RANK: Readonly<Record<Strength, number>> = { empty: 0, weak: 1, okay: 2, strong: 3 };

function rangeOf(band: Band): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error('secrets-stay-secret is a rounds activity');
  const range = activity.difficulty[band];
  if (range === undefined) throw new Error(`no range for ${band}`);
  return range;
}

/** The four facts the lesson always asks about. */
const ALWAYS: readonly FactId[] = ['home-address', 'full-name-birthday', 'favorite-color', 'favorite-animal'];

/** What makes a round fair: both boxes get cards, nothing repeats, and the pieces can make it strong. */
function problems(level: SecretsLevel): string[] {
  const found: string[] = [];
  if (new Set(level.facts).size !== level.facts.length) found.push('a card repeats');
  for (const fact of ALWAYS) if (!level.facts.includes(fact)) found.push(`${fact} is missing`);
  const bins = new Set(level.facts.map(binOf));
  if (bins.size !== 2) found.push('one box gets no card');
  if (new Set(level.pieces.map((piece) => piece.id)).size !== level.pieces.length) found.push('a piece id repeats');
  if (new Set(level.pieces.map((piece) => piece.text)).size !== level.pieces.length) found.push('a piece repeats');
  // Adding the pieces in order never makes it weaker, and all of them make it strong.
  let password = '';
  for (const piece of level.pieces) {
    const before = RANK[strengthOf(password)];
    password += piece.text;
    if (RANK[strengthOf(password)] < before) found.push(`${piece.text} made it weaker`);
  }
  if (strengthOf(password) !== 'strong') found.push('every piece together is not strong');
  return found;
}

describe.each(['band-6-8', 'band-9-12'] as const)('secrets stay secret for %s', (band) => {
  const { min, max } = rangeOf(band);

  it.each([min, max])('is fair and solvable at difficulty %i for every seed', (difficulty) => {
    for (const seed of SEEDS) expect(problems(generateLevel(seed, difficulty, band)), `seed ${seed}`).toEqual([]);
  });
});

describe('secrets stay secret difficulty', () => {
  it('adds one card at a time, from four to all eight', () => {
    expect(CARD_COUNTS).toEqual([4, 5, 6, 7, 8]);
    for (let difficulty = 1; difficulty <= 5; difficulty += 1) {
      expect(generateLevel(SEEDS[0] ?? 1, difficulty, 'band-9-12').facts).toHaveLength(
        CARD_COUNTS[difficulty - 1] ?? 0,
      );
    }
    expect(new Set(generateLevel(1, 5, 'band-9-12').facts)).toEqual(new Set(FACTS.map((fact) => fact.id)));
  });

  it('keeps a difficulty outside the table on its nearest row', () => {
    expect(generateLevel(1, 0, 'band-6-8').facts).toHaveLength(4);
    expect(generateLevel(1, 9, 'band-9-12').facts).toHaveLength(8);
  });

  it('shuffles the cards and the pieces across seeds', () => {
    const firstCards = new Set(SEEDS.map((seed) => generateLevel(seed, 1, 'band-6-8').facts[0]));
    expect(firstCards.size).toBe(4);
    const firstPieces = new Set(SEEDS.map((seed) => generateLevel(seed, 1, 'band-6-8').pieces[0]?.text));
    expect(firstPieces.size).toBeGreaterThan(8);
  });
});

describe('facts', () => {
  it('puts the address, full name with birthday, phone number, and password in the locked box', () => {
    // The design: plainly private or plainly fine to share, never "it depends".
    expect(Object.fromEntries(FACTS.map((fact) => [fact.id, binOf(fact.id)]))).toEqual({
      'home-address': 'private',
      'full-name-birthday': 'private',
      'phone-number': 'private',
      'your-password': 'private',
      'favorite-color': 'share',
      'favorite-animal': 'share',
      'favorite-food': 'share',
      'favorite-song': 'share',
    });
  });

  it('draws each card with a bundled emoji', () => {
    for (const fact of FACTS) expect(emojiNames[fact.emoji], fact.id).toBeDefined();
  });
});

describe('strengthOf', () => {
  it.each([
    ['', 'empty'],
    ['frogmoo', 'weak'],
    ['frogmoon', 'okay'],
    ['frogmoonkitepe', 'okay'],
    ['frogmoonkitepea', 'strong'],
    ['Frogmoon7!', 'okay'],
    ['Frogmoonkit7', 'strong'],
    ['Frogmoonki7', 'okay'],
    ['Frogmoonkite', 'okay'],
    ['frogmoonkit7', 'okay'],
  ] as const)('rates %j as %s', (password, expected) => {
    expect(strengthOf(password)).toBe(expected);
  });
});

describe('kindOf', () => {
  it.each([
    ['a', 'lower'],
    ['z', 'lower'],
    ['A', 'upper'],
    ['Z', 'upper'],
    ['0', 'digit'],
    ['9', 'digit'],
    ['!', 'symbol'],
    ['#', 'symbol'],
  ] as const)('sorts %s as %s', (character, kind) => {
    expect(kindOf(character)).toBe(kind);
  });
});
