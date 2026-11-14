import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Follow the trail: a winding path from a bug on the left to its flower on the right. The bug
 * walks along with the pointer while the pointer stays on the path near it. When the pointer
 * leaves the path, the bug waits where it is; nothing goes back to the start.
 *
 * The field is 1000 by 600 units and scales to fit. The path runs left to right, so it never
 * crosses itself. Difficulty narrows the path and adds bends.
 */

export const FIELD = { width: 1000, height: 600 } as const;

/** Space between the path's edge and the field's edge. */
export const EDGE_MARGIN = 30;

/** Where the path starts and ends, left to right. The bug and its flower sit on the ends. */
export const START_X = 110;
export const END_X = 890;

/** The wait after the bug reaches its flower, so the child sees it arrive. */
export const ARRIVE_PAUSE_MS = 1200;

/** The bugs and the flower each one walks to. */
export const TRAVELERS = [
  { bug: 'ladybug', home: 'flower' },
  { bug: 'bee', home: 'sunflower' },
  { bug: 'butterfly', home: 'tulip' },
  { bug: 'snail', home: 'leaf' },
] as const satisfies readonly { bug: EmojiId; home: EmojiId }[];

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface TrailLevel {
  /** The center line of the path, start first, in field units. */
  readonly points: readonly Point[];
  /** The distance along the path to each point. The first is 0, the last is the whole length. */
  readonly along: readonly number[];
  /** The path's width, in field units. */
  readonly width: number;
  /** How many turns the path makes between its ends. */
  readonly bends: number;
  readonly traveler: (typeof TRAVELERS)[number];
}

export interface Step {
  readonly width: number;
  readonly bends: number;
  /** The most a bend reaches above or below the middle, in field units. */
  readonly swing: number;
}

/** One entry per difficulty, 1 first: a narrower path with more and deeper bends. */
export const STEPS: readonly Step[] = [
  { width: 150, bends: 1, swing: 110 },
  { width: 135, bends: 2, swing: 130 },
  { width: 120, bends: 2, swing: 150 },
  { width: 105, bends: 3, swing: 165 },
  { width: 95, bends: 3, swing: 180 },
  { width: 85, bends: 4, swing: 190 },
  { width: 75, bends: 5, swing: 200 },
  { width: 65, bends: 6, swing: 210 },
];

export const MAX_TRAIL_DIFFICULTY = STEPS.length;

/** Points drawn between two control points. Enough for a smooth curve at any window size. */
const SAMPLES_PER_SPAN = 16;

/** The step for a difficulty. Throws outside 1 to MAX_TRAIL_DIFFICULTY. */
export function stepFor(difficulty: number): Step {
  const step = STEPS[difficulty - 1];
  if (!Number.isInteger(difficulty) || step === undefined) {
    throw new RangeError(
      `Follow the trail has difficulty 1 to ${String(MAX_TRAIL_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return step;
}

/** One coordinate of a uniform Catmull-Rom curve between b and c, at t from 0 to 1. */
function catmullRom(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
}

/**
 * A smooth curve through the control points, as a polyline. The controls are evenly spaced in x,
 * so x grows evenly along the curve and the path never doubles back.
 */
export function smoothPath(controls: readonly Point[]): Point[] {
  const at = (index: number): Point => {
    const point = controls[Math.min(Math.max(index, 0), controls.length - 1)];
    if (point === undefined) throw new RangeError('A path needs at least one point.');
    return point;
  };
  const points: Point[] = [at(0)];
  for (let span = 0; span < controls.length - 1; span += 1) {
    const [a, b, c, d] = [at(span - 1), at(span), at(span + 1), at(span + 2)];
    for (let sample = 1; sample <= SAMPLES_PER_SPAN; sample += 1) {
      const t = sample / SAMPLES_PER_SPAN;
      points.push({
        x: Math.round(catmullRom(a.x, b.x, c.x, d.x, t)),
        y: Math.round(catmullRom(a.y, b.y, c.y, d.y, t)),
      });
    }
  }
  return points;
}

/** The distance along a polyline to each of its points. */
export function measure(points: readonly Point[]): number[] {
  const along: number[] = [];
  let total = 0;
  let previous: Point | null = null;
  for (const point of points) {
    if (previous !== null) total += Math.hypot(point.x - previous.x, point.y - previous.y);
    along.push(total);
    previous = point;
  }
  return along;
}

/** Pure: the same seed, difficulty, and band give the same path. */
export function generateLevel(seed: number, difficulty: number, _band: Band): TrailLevel {
  const step = stepFor(difficulty);
  const random = createRandom(seed);
  const middle = FIELD.height / 2;
  const count = step.bends + 2;
  const spacing = (END_X - START_X) / (count - 1);
  // The bends take turns above and below the middle; which comes first changes from seed to seed.
  const firstUp = random.next() < 0.5;
  const controls: Point[] = Array.from({ length: count }, (_, index) => {
    const x = Math.round(START_X + index * spacing);
    if (index === 0 || index === count - 1)
      return { x, y: middle + random.int(-Math.round(step.swing / 2), Math.round(step.swing / 2)) };
    const side = (index % 2 === 1) === firstUp ? -1 : 1;
    return { x, y: middle + side * random.int(Math.round(step.swing * 0.6), step.swing) };
  });
  const points = smoothPath(controls);
  return {
    points,
    along: measure(points),
    width: step.width,
    bends: step.bends,
    traveler: random.pick(TRAVELERS),
  };
}

/** The point on the path at a distance along it, clamped to the path's ends. */
export function pointAt(level: Pick<TrailLevel, 'points' | 'along'>, distance: number): Point {
  const { points, along } = level;
  const last = points[points.length - 1];
  if (last === undefined) throw new RangeError('A path needs at least one point.');
  for (let index = 1; index < points.length; index += 1) {
    const end = along[index] ?? 0;
    if (distance > end) continue;
    const start = along[index - 1] ?? 0;
    const from = points[index - 1] ?? last;
    const to = points[index] ?? last;
    const t = end === start ? 0 : Math.max(0, (distance - start) / (end - start));
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  }
  return last;
}

/** The whole length of the path. */
export function lengthOf(level: Pick<TrailLevel, 'along'>): number {
  return level.along[level.along.length - 1] ?? 0;
}

export interface Walk {
  /** How far along the path the bug has walked. It never goes back. */
  readonly progress: number;
  /** Whether the pointer is on the path next to the bug, so the bug walks with it. */
  readonly with: boolean;
}

/**
 * Where the pointer at `pointer` leaves the bug that has walked `progress`. The pointer leads the
 * bug when it is on the path, no farther ahead than one path width and no farther behind. It
 * cannot skip a bend by jumping ahead, and leaving the path only makes the bug wait.
 */
export function walkTo(level: Pick<TrailLevel, 'points' | 'along' | 'width'>, progress: number, pointer: Point): Walk {
  const { points, along, width } = level;
  let best: { distance: number; at: number } | null = null;
  for (const [index, to] of points.entries()) {
    const from = points[index - 1];
    if (from === undefined) continue;
    const start = along[index - 1] ?? 0;
    const end = along[index] ?? 0;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const span = dx * dx + dy * dy;
    const t = span === 0 ? 0 : Math.min(1, Math.max(0, ((pointer.x - from.x) * dx + (pointer.y - from.y) * dy) / span));
    const at = start + t * (end - start);
    // Only the stretch of path around the bug counts.
    if (at < progress - width || at > progress + width) continue;
    const distance = Math.hypot(pointer.x - (from.x + t * dx), pointer.y - (from.y + t * dy));
    if (best === null || distance < best.distance) best = { distance, at };
  }
  if (best === null || best.distance > width / 2) return { progress, with: false };
  return { progress: Math.max(progress, Math.min(best.at, lengthOf(level))), with: true };
}

/**
 * Follows the pointer from `from` to `to`, in steps of a quarter of the path's width, so a quick
 * flick along the path moves the bug as far as a slow one.
 */
export function follow(
  level: Pick<TrailLevel, 'points' | 'along' | 'width'>,
  progress: number,
  from: Point,
  to: Point,
): Walk {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (level.width / 4)));
  let walk: Walk = { progress, with: false };
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    walk = walkTo(level, walk.progress, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
  return walk;
}

/** Whether the bug has reached its flower: within half a path width of the end. */
export function arrived(level: Pick<TrailLevel, 'along' | 'width'>, progress: number): boolean {
  return progress >= lengthOf(level) - level.width / 2;
}
