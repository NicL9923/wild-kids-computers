import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import {
  arrived,
  EDGE_MARGIN,
  END_X,
  FIELD,
  follow,
  generateLevel,
  lengthOf,
  MAX_TRAIL_DIFFICULTY,
  measure,
  pointAt,
  smoothPath,
  START_X,
  STEPS,
  stepFor,
  TRAVELERS,
  walkTo,
  type Point,
  type TrailLevel,
} from './level.ts';

const SEEDS = Array.from({ length: 200 }, (_, index) => index * 104_729 + 5);

/** The difficulty range of each band, as activity.ts declares it. */
const BAND_RANGES: readonly [Band, number, number][] = [
  ['band-3-5', 1, 5],
  ['band-6-8', 3, MAX_TRAIL_DIFFICULTY],
];

/** Every rule that makes a path fair, checked from the level alone. */
function problems(level: TrailLevel): string[] {
  const found: string[] = [];
  const half = level.width / 2;
  for (const point of level.points) {
    if (point.y - half < EDGE_MARGIN || point.y + half > FIELD.height - EDGE_MARGIN) {
      found.push(`the path leaves the field at ${String(point.x)}`);
      break;
    }
  }
  for (let index = 1; index < level.points.length; index += 1) {
    if ((level.points[index]?.x ?? 0) < (level.points[index - 1]?.x ?? 0)) {
      found.push('the path doubles back');
      break;
    }
  }
  if (level.points[0]?.x !== START_X || level.points.at(-1)?.x !== END_X) found.push('the ends moved');
  return found;
}

/** Walks the pointer along the path in small steps, offset sideways by `offset`, and reports how far the bug got. */
function trace(level: TrailLevel, offset: number): number {
  let progress = 0;
  const start = level.points[0] ?? { x: 0, y: 0 };
  let last: Point = { x: start.x, y: start.y + offset };
  for (let distance = 0; distance <= lengthOf(level); distance += 10) {
    const center = pointAt(level, distance);
    const next = { x: center.x, y: center.y + offset };
    progress = follow(level, progress, last, next).progress;
    last = next;
  }
  return progress;
}

describe('generateLevel', () => {
  it.each(Array.from({ length: MAX_TRAIL_DIFFICULTY }, (_, index) => index + 1))(
    'at difficulty %i gives a path on the field that a child can follow to the end, for every seed',
    (difficulty) => {
      const step = stepFor(difficulty);
      for (const seed of SEEDS) {
        const level = generateLevel(seed, difficulty, 'band-6-8');
        expect(problems(level), `seed ${String(seed)}`).toEqual([]);
        expect(level.width).toBe(step.width);
        // Following the middle reaches the flower, and so does a wobble a third of the width off.
        expect(arrived(level, trace(level, 0)), `seed ${String(seed)}`).toBe(true);
        expect(arrived(level, trace(level, level.width / 3)), `seed ${String(seed)}`).toBe(true);
        // A pointer that runs beside the path, not on it, leaves the bug at the start.
        expect(trace(level, level.width * 2 + 40), `seed ${String(seed)}`).toBe(0);
      }
    },
  );

  it.each(BAND_RANGES)('in %s is wide enough to stay on at the hardest and turns at the easiest', (band, min, max) => {
    const easiest = generateLevel(7, min, band);
    const hardest = generateLevel(7, max, band);
    // At a 1280 by 800 window a unit is at least one pixel, so the path is wider than the band's target.
    expect(hardest.width).toBeGreaterThanOrEqual(band === 'band-3-5' ? 72 : 56);
    expect(easiest.bends).toBeGreaterThanOrEqual(1);
    expect(hardest.width).toBeLessThan(easiest.width);
    expect(hardest.bends).toBeGreaterThan(easiest.bends);
  });

  it('turns as many times as the step says', () => {
    // Count where the path changes from going up to going down, after smoothing.
    for (const difficulty of [1, 4, MAX_TRAIL_DIFFICULTY]) {
      for (const seed of SEEDS.slice(0, 40)) {
        const level = generateLevel(seed, difficulty, 'band-6-8');
        const rises = level.points.slice(1).map((point, index) => Math.sign(point.y - (level.points[index]?.y ?? 0)));
        const moving = rises.filter((rise) => rise !== 0);
        const turns = moving.filter((rise, index) => index > 0 && rise !== moving[index - 1]).length;
        // The ends can add one gentle turn each, but never take a bend away.
        expect(turns).toBeGreaterThanOrEqual(level.bends);
        expect(turns).toBeLessThanOrEqual(level.bends + 2);
      }
    }
  });

  it('changes by small steps: one level narrows the path by at most 15 units and adds at most one bend', () => {
    for (let index = 1; index < STEPS.length; index += 1) {
      const before = STEPS[index - 1];
      const after = STEPS[index];
      if (before === undefined || after === undefined) throw new Error('missing step');
      expect(before.width - after.width).toBeGreaterThan(0);
      expect(before.width - after.width).toBeLessThanOrEqual(15);
      expect(after.bends - before.bends).toBeGreaterThanOrEqual(0);
      expect(after.bends - before.bends).toBeLessThanOrEqual(1);
    }
  });

  it('sends every bug to its own flower across rounds, and bends both ways first', () => {
    const travelers = new Set(SEEDS.map((seed) => generateLevel(seed, 2, 'band-3-5').traveler.bug));
    expect([...travelers].toSorted()).toEqual(TRAVELERS.map((each) => each.bug).toSorted());
    const firstBend = new Set(
      SEEDS.map((seed) => Math.sign((generateLevel(seed, 1, 'band-3-5').points[16]?.y ?? 300) - 300)),
    );
    expect([...firstBend].toSorted((a, b) => a - b)).toEqual([-1, 1]);
  });

  it.each([0, MAX_TRAIL_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 8, not/);
  });
});

/** A straight path from (100, 300) to (500, 300), 80 wide. */
const straight = (() => {
  const points = [
    { x: 100, y: 300 },
    { x: 300, y: 300 },
    { x: 500, y: 300 },
  ];
  return { points, along: measure(points), width: 80 };
})();

describe('walkTo', () => {
  it.each([
    ['on the path next to the bug', 100, { x: 250, y: 330 }, { progress: 150, with: true }],
    ['exactly half a width off the path', 100, { x: 250, y: 340 }, { progress: 150, with: true }],
    ['just past half a width off the path', 100, { x: 250, y: 341 }, { progress: 100, with: false }],
    ['exactly one width ahead of the bug', 100, { x: 280, y: 300 }, { progress: 180, with: true }],
    ['more than one width ahead of the bug', 100, { x: 281, y: 300 }, { progress: 100, with: false }],
    ['at the flower while the bug is at the start', 0, { x: 500, y: 300 }, { progress: 0, with: false }],
    ['behind the bug, on the path', 150, { x: 220, y: 300 }, { progress: 150, with: true }],
    ['exactly one width behind the bug', 150, { x: 170, y: 300 }, { progress: 150, with: true }],
    ['more than one width behind the bug', 150, { x: 169, y: 300 }, { progress: 150, with: false }],
  ] as const)('with the pointer %s', (_label, progress, pointer, walk) => {
    expect(walkTo(straight, progress, pointer)).toEqual(walk);
  });

  it('never walks past the end', () => {
    expect(walkTo(straight, 390, { x: 520, y: 300 })).toEqual({ progress: 400, with: true });
  });
});

describe('follow', () => {
  it('moves the bug the whole way on a quick flick along the path', () => {
    expect(follow(straight, 0, { x: 100, y: 300 }, { x: 500, y: 300 })).toEqual({ progress: 400, with: true });
  });

  it('stops the bug where the pointer left the path, and it waits there', () => {
    const walk = follow(straight, 0, { x: 100, y: 300 }, { x: 260, y: 420 });
    expect(walk.with).toBe(false);
    expect(walk.progress).toBeGreaterThan(0);
    expect(walk.progress).toBeLessThan(160);
    expect(follow(straight, walk.progress, { x: 260, y: 420 }, { x: 480, y: 420 })).toEqual({
      progress: walk.progress,
      with: false,
    });
  });
});

describe('pointAt and arrived', () => {
  it('finds the point at a distance, clamped to the ends', () => {
    expect(pointAt(straight, 50)).toEqual({ x: 150, y: 300 });
    expect(pointAt(straight, 250)).toEqual({ x: 350, y: 300 });
    expect(pointAt(straight, -20)).toEqual({ x: 100, y: 300 });
    expect(pointAt(straight, 999)).toEqual({ x: 500, y: 300 });
  });

  it('counts the bug home within half a width of the end, not before', () => {
    expect(arrived(straight, 360)).toBe(true);
    expect(arrived(straight, 359)).toBe(false);
  });
});

describe('smoothPath', () => {
  it('passes through every control point and starts and ends on them', () => {
    const controls = [
      { x: 100, y: 300 },
      { x: 300, y: 150 },
      { x: 500, y: 420 },
    ];
    const points = smoothPath(controls);
    for (const control of controls) expect(points).toContainEqual(control);
    expect(points[0]).toEqual(controls[0]);
    expect(points.at(-1)).toEqual(controls[2]);
    expect(points).toHaveLength(33);
  });

  it('rejects a path with no points', () => {
    expect(() => smoothPath([])).toThrow('A path needs at least one point.');
  });
});
