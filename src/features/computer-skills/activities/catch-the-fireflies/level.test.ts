import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import {
  angleAfter,
  EDGE_MARGIN,
  generateLevel,
  LOOP_GAP,
  MAX_FIREFLY_DIFFICULTY,
  positionAt,
  SKY,
  STEPS,
  stepFor,
  type FirefliesLevel,
} from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 6007 + 1);
const DIFFICULTIES = Array.from({ length: MAX_FIREFLY_DIFFICULTY }, (_, index) => index + 1);
const ANGLES = Array.from({ length: 96 }, (_, index) => (index / 96) * 2 * Math.PI);

/** Every rule that makes a sky fair, checked by flying each firefly all the way round its loop. */
function problems(level: FirefliesLevel): string[] {
  const found: string[] = [];
  const r = level.size / 2;
  const boxes = level.fireflies.map((firefly) => {
    const points = ANGLES.map((angle) => positionAt(firefly, angle));
    return {
      id: firefly.id,
      left: Math.min(...points.map((point) => point.x)) - r,
      right: Math.max(...points.map((point) => point.x)) + r,
      top: Math.min(...points.map((point) => point.y)) - r,
      bottom: Math.max(...points.map((point) => point.y)) + r,
    };
  });
  boxes.forEach((box, index) => {
    if (box.left < EDGE_MARGIN || box.right > SKY.width - EDGE_MARGIN) found.push(`${box.id} flies off sideways`);
    if (box.top < EDGE_MARGIN || box.bottom > SKY.height - EDGE_MARGIN) found.push(`${box.id} flies off the sky`);
    for (const other of boxes.slice(index + 1)) {
      const apart = Math.max(
        other.left - box.right,
        box.left - other.right,
        other.top - box.bottom,
        box.top - other.bottom,
      );
      if (apart < LOOP_GAP) found.push(`${box.id} comes within ${String(Math.round(apart))} of ${other.id}`);
    }
  });
  if (new Set(level.fireflies.map((firefly) => firefly.id)).size !== level.fireflies.length) found.push('ids repeat');
  return found;
}

/** The fastest and slowest a firefly moves around its loop, in sky units a second. */
function speeds(level: FirefliesLevel): { fastest: number; slowest: number } {
  const all = level.fireflies.flatMap((firefly) =>
    ANGLES.map((angle) => {
      const now = positionAt(firefly, angle);
      const later = positionAt(firefly, angle + firefly.turn / 1000);
      return Math.hypot(later.x - now.x, later.y - now.y) * 1000;
    }),
  );
  return { fastest: Math.max(...all), slowest: Math.min(...all) };
}

describe('generateLevel', () => {
  it.each(DIFFICULTIES)('at difficulty %i keeps every loop in the sky and apart, for every seed', (difficulty) => {
    const step = stepFor(difficulty);
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      expect(level.fireflies).toHaveLength(step.count);
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
      // Never faster than the step's speed, and never slower than three fifths of it.
      const { fastest, slowest } = speeds(level);
      expect(fastest).toBeLessThanOrEqual(step.speed + 0.5);
      expect(slowest).toBeGreaterThanOrEqual(step.speed * 0.6 - 0.5);
    }
  });

  it.each<[Band, number, number]>([
    ['band-3-5', 1, 5],
    ['band-6-8', 3, MAX_FIREFLY_DIFFICULTY],
  ])('in %s starts slow and stays large enough to catch at the hardest', (band, min, max) => {
    const easiest = generateLevel(9, min, band);
    const hardest = generateLevel(9, max, band);
    // At a 1280 by 800 window a unit is at least one pixel.
    expect(hardest.size).toBeGreaterThanOrEqual(band === 'band-3-5' ? 72 : 56);
    expect(easiest.speed).toBeLessThan(hardest.speed);
  });

  it("keeps a young child's fastest firefly slow: under 100 units a second, a tenth of the sky", () => {
    expect(generateLevel(9, 5, 'band-3-5').speed).toBeLessThanOrEqual(100);
  });

  it('starts with one big, slow firefly', () => {
    const level = generateLevel(3, 1, 'band-3-5');
    expect(level.fireflies).toHaveLength(1);
    expect(level.speed).toBe(30);
    expect(level.size).toBe(160);
  });

  it('changes by small steps: at most one more firefly, 20 units quicker, and 10 units smaller', () => {
    for (let index = 1; index < STEPS.length; index += 1) {
      const before = STEPS[index - 1];
      const after = STEPS[index];
      if (before === undefined || after === undefined) throw new Error('missing step');
      expect(after.count - before.count).toBeGreaterThanOrEqual(0);
      expect(after.count - before.count).toBeLessThanOrEqual(1);
      expect(after.speed - before.speed).toBeGreaterThan(0);
      expect(after.speed - before.speed).toBeLessThanOrEqual(20);
      expect(before.size - after.size).toBeGreaterThan(0);
      expect(before.size - after.size).toBeLessThanOrEqual(10);
    }
  });

  it('flies both ways round, from many starting places, in every part of the sky', () => {
    const levels = SEEDS.slice(0, 80).map((seed) => generateLevel(seed, 4, 'band-3-5'));
    const ways = new Set(levels.flatMap((level) => level.fireflies.map((firefly) => Math.sign(firefly.turn))));
    expect([...ways].toSorted((a, b) => a - b)).toEqual([-1, 1]);
    const phases = new Set(levels.map((level) => level.fireflies[0]?.phase));
    expect(phases.size).toBeGreaterThan(70);
    for (const level of levels) {
      for (const firefly of level.fireflies) {
        expect(firefly.phase).toBeGreaterThanOrEqual(0);
        expect(firefly.phase).toBeLessThan(2 * Math.PI);
      }
    }
    // Starting places cover the whole loop, not one part of it.
    const allPhases = levels.flatMap((level) => level.fireflies.map((firefly) => firefly.phase));
    expect(Math.max(...allPhases)).toBeGreaterThan(1.5 * Math.PI);
    // Loops sit higher or lower in their part of the sky from round to round.
    expect(new Set(levels.map((level) => level.fireflies[0]?.cy)).size).toBeGreaterThan(20);
  });

  it.each([0, MAX_FIREFLY_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 8, not/);
  });
});

describe('angleAfter and positionAt', () => {
  const firefly = { cx: 500, cy: 300, rx: 100, ry: 60, phase: 0, turn: Math.PI / 2 };

  it('turns a quarter of the loop in one second at a quarter turn a second', () => {
    const position = positionAt(firefly, angleAfter(firefly, 1000));
    expect(position.x).toBeCloseTo(500, 6);
    expect(position.y).toBeCloseTo(360, 6);
  });

  it('turns half as far at half pace, and starts at its phase', () => {
    expect(angleAfter(firefly, 1000, 0.5)).toBeCloseTo(Math.PI / 4, 6);
    expect(positionAt(firefly, angleAfter({ ...firefly, phase: Math.PI }, 0))).toEqual({
      x: 400,
      y: 300 + 60 * Math.sin(Math.PI),
    });
  });

  it('turns the other way with a negative rate', () => {
    expect(positionAt(firefly, angleAfter({ ...firefly, turn: -Math.PI / 2 }, 1000)).y).toBeCloseTo(240, 6);
  });
});
