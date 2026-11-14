import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import {
  BLANKET,
  belongs,
  FOODS,
  generateLevel,
  GRASS,
  gridIn,
  MAX_PICNIC_DIFFICULTY,
  SCENE,
  STEPS,
  stepFor,
  type PicnicLevel,
} from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 92_821 + 17);
const DIFFICULTIES = Array.from({ length: MAX_PICNIC_DIFFICULTY }, (_, index) => index + 1);

type Box = { id: string; x: number; y: number; size: number };

function overlaps(boxes: readonly Box[], gap: number): string[] {
  const found: string[] = [];
  boxes.forEach((box, index) => {
    for (const other of boxes.slice(index + 1)) {
      const apart = Math.max(Math.abs(box.x - other.x), Math.abs(box.y - other.y)) - (box.size + other.size) / 2;
      if (apart < gap) found.push(`${box.id} and ${other.id} are ${String(apart)} apart`);
    }
  });
  return found;
}

/** Every rule that makes a picnic fair, checked from the level alone. */
function problems(level: PicnicLevel): string[] {
  const found: string[] = [];
  const pieces = level.pieces.map((piece) => ({ ...piece, size: level.size }));
  for (const box of [...pieces, ...level.places]) {
    const r = box.size / 2;
    if (box.x - r < 0 || box.x + r > SCENE.width || box.y - r < 0 || box.y + r > SCENE.height) {
      found.push(`${box.id} leaves the scene`);
    }
  }
  found.push(...overlaps(pieces, 8), ...overlaps(level.places, 8));
  // Every piece crosses the middle to reach any place.
  const rightmostPiece = Math.max(...pieces.map((piece) => piece.x + piece.size / 2));
  const leftmostPlace = Math.min(...level.places.map((place) => place.x - place.size / 2));
  if (leftmostPlace - rightmostPiece < 60) found.push('the food starts too close to its places');
  // Exactly one place takes each piece, so there is one right answer and no trap.
  for (const piece of level.pieces) {
    const homes = level.places.filter((place) => belongs(place, piece.id));
    if (homes.length !== 1) found.push(`${piece.id} has ${String(homes.length)} places`);
  }
  if (new Set(level.pieces.map((piece) => piece.food)).size !== level.pieces.length) found.push('a food repeats');
  return found;
}

describe('generateLevel', () => {
  it.each(DIFFICULTIES)('at difficulty %i gives a fair picnic for every seed', (difficulty) => {
    const step = stepFor(difficulty);
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      expect(level.pieces).toHaveLength(step.count);
      expect(level.mode).toBe(step.mode);
      expect(level.places).toHaveLength(step.mode === 'basket' ? 1 : step.count);
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
    }
  });

  it.each<[Band, number, number]>([
    ['band-3-5', 1, 5],
    ['band-6-8', 3, MAX_PICNIC_DIFFICULTY],
  ])('in %s keeps food at least the band target and starts with fewer pieces', (band, min, max) => {
    const easiest = generateLevel(4, min, band);
    const hardest = generateLevel(4, max, band);
    // At a 1280 by 800 window a unit is at least one pixel.
    expect(hardest.size).toBeGreaterThanOrEqual(band === 'band-3-5' ? 72 : 56);
    expect(easiest.pieces.length).toBeLessThan(hardest.pieces.length);
  });

  it('starts with two pieces and one big basket that takes everything', () => {
    const level = generateLevel(8, 1, 'band-3-5');
    expect(level.pieces).toHaveLength(2);
    expect(level.places).toEqual([expect.objectContaining({ id: 'basket', takes: null })]);
  });

  it('lays the blanket places in another order than the food, across seeds', () => {
    const levels = SEEDS.slice(0, 60).map((seed) => generateLevel(seed, 6, 'band-6-8'));
    const shuffled = levels.filter((level) =>
      level.places.some((place, index) => place.takes !== `piece-${String(index)}`),
    );
    expect(shuffled.length).toBeGreaterThan(50);
  });

  it('uses every food across rounds', () => {
    const foods = new Set(
      SEEDS.slice(0, 80).flatMap((seed) => generateLevel(seed, 8, 'band-6-8').pieces.map((piece) => piece.food)),
    );
    expect([...foods].toSorted()).toEqual([...FOODS].toSorted());
  });

  it('changes by small steps: at most one more piece and 10 units smaller', () => {
    for (let index = 1; index < STEPS.length; index += 1) {
      const before = STEPS[index - 1];
      const after = STEPS[index];
      if (before === undefined || after === undefined) throw new Error('missing step');
      expect(before.size - after.size).toBeGreaterThanOrEqual(0);
      expect(before.size - after.size).toBeLessThanOrEqual(10);
      // The switch to the blanket starts again from two pieces.
      expect(after.count - before.count).toBeLessThanOrEqual(1);
    }
  });

  it.each([0, MAX_PICNIC_DIFFICULTY + 1, 3.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 8, not/);
  });
});

describe('gridIn', () => {
  it.each([
    [1, 1],
    [4, 2],
    [5, 3],
  ])('puts %i cells in rows of up to two, then three: %i columns', (count, columns) => {
    const centers = gridIn(createRandom(1), GRASS, count, 0);
    expect(new Set(centers.map((center) => center.x)).size).toBe(columns);
  });

  it('keeps cells centered in their area with no nudge', () => {
    expect(gridIn(createRandom(1), BLANKET, 4, 0)).toEqual([
      { x: 645, y: 180 },
      { x: 855, y: 180 },
      { x: 645, y: 420 },
      { x: 855, y: 420 },
    ]);
  });
});

describe('belongs', () => {
  it.each([
    ['anything in the basket', null, 'piece-1', true],
    ['its own piece on a blanket place', 'piece-1', 'piece-1', true],
    ['another piece on a blanket place', 'piece-1', 'piece-2', false],
  ] as const)('takes %s', (_label, takes, piece, expected) => {
    expect(belongs({ takes }, piece)).toBe(expected);
  });
});
