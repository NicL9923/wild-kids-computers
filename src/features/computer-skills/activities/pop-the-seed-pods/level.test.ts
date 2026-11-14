import { describe, expect, it } from 'vitest';
import {
  BOARD,
  EDGE_MARGIN,
  EXIT_KEEP_OUT,
  FALLBACK_LAYOUTS,
  fits,
  generateLevel,
  KEEP_OUT_GAP,
  MAX_POD_DIFFICULTY,
  STEPS,
  stepFor,
  type Pod,
} from './level.ts';

const SEEDS = Array.from({ length: 400 }, (_, index) => index * 7919);
const DIFFICULTIES = Array.from({ length: MAX_POD_DIFFICULTY }, (_, index) => index + 1);

/** Every rule that makes a level fair for a 3-year-old, checked from the pods alone. */
function problems(pods: readonly Pod[], gap: number): string[] {
  const found: string[] = [];
  pods.forEach((pod, index) => {
    const r = pod.size / 2;
    if (pod.x - r < EDGE_MARGIN || pod.x + r > BOARD.width - EDGE_MARGIN)
      found.push(`${pod.id} leaves the board sideways`);
    if (pod.y - r < EDGE_MARGIN || pod.y + r > BOARD.height - EDGE_MARGIN) found.push(`${pod.id} leaves the board`);
    const nearX = Math.min(Math.max(pod.x, EXIT_KEEP_OUT.left), EXIT_KEEP_OUT.right);
    const nearY = Math.min(Math.max(pod.y, EXIT_KEEP_OUT.top), EXIT_KEEP_OUT.bottom);
    if (Math.hypot(pod.x - nearX, pod.y - nearY) < r + KEEP_OUT_GAP) found.push(`${pod.id} is near the exit`);
    for (const other of pods.slice(index + 1)) {
      const edge = Math.hypot(pod.x - other.x, pod.y - other.y) - r - other.size / 2;
      if (edge < gap) found.push(`${pod.id} and ${other.id} are ${String(Math.round(edge))} apart`);
    }
  });
  return found;
}

describe('generateLevel', () => {
  it.each(DIFFICULTIES)('at difficulty %i gives the right number of pods, all fair, for every seed', (difficulty) => {
    const step = stepFor(difficulty);
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-3-5');
      expect(level.pods).toHaveLength(step.count);
      expect(new Set(level.pods.map((pod) => pod.id)).size).toBe(step.count);
      expect(problems(level.pods, level.gap), `seed ${String(seed)}`).toEqual([]);
    }
  });

  it('repeats the same layout for the same seed and moves pods for another seed', () => {
    expect(generateLevel(42, 4, 'band-3-5')).toEqual(generateLevel(42, 4, 'band-3-5'));
    expect(generateLevel(42, 4, 'band-3-5')).not.toEqual(generateLevel(43, 4, 'band-3-5'));
  });

  it('uses different places across seeds, so the pods do not always sit in the same spots', () => {
    const firstPods = new Set(
      SEEDS.slice(0, 50).map((seed) => JSON.stringify(generateLevel(seed, 3, 'band-3-5').pods[0])),
    );
    expect(firstPods.size).toBeGreaterThan(40);
  });

  it('gives fewer, larger, farther apart pods at the lowest difficulty than at the highest', () => {
    const easiest = generateLevel(1, 1, 'band-3-5');
    const hardest = generateLevel(1, MAX_POD_DIFFICULTY, 'band-3-5');
    expect(easiest.pods.length).toBeLessThan(hardest.pods.length);
    expect(easiest.pods[0]?.size).toBeGreaterThan(hardest.pods[0]?.size ?? Infinity);
    expect(easiest.gap).toBeGreaterThan(hardest.gap);
  });

  it('changes by small steps: one level up adds at most one pod and shrinks pods by at most 20 units', () => {
    for (let index = 1; index < STEPS.length; index += 1) {
      const before = STEPS[index - 1];
      const after = STEPS[index];
      expect(after?.count).toBeGreaterThanOrEqual(before?.count ?? 0);
      expect((after?.count ?? 0) - (before?.count ?? 0)).toBeLessThanOrEqual(1);
      expect((before?.size ?? 0) - (after?.size ?? 0)).toBeLessThanOrEqual(20);
      expect(after?.size).toBeLessThanOrEqual(before?.size ?? 0);
    }
  });

  it('never makes a pod smaller than twice the youngest band target at a 1280 by 800 window', () => {
    // At 1280 by 800 the board is about 1080 pixels wide, so a unit is at least one pixel.
    const smallest = Math.min(...STEPS.map((step) => step.size));
    expect(smallest).toBeGreaterThanOrEqual(2 * 72);
  });

  it.each([0, MAX_POD_DIFFICULTY + 1, 2.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 6, not/);
  });
});

describe('the fallback layouts', () => {
  it.each(DIFFICULTIES)('fit the rules at difficulty %i', (difficulty) => {
    const step = stepFor(difficulty);
    const layout = FALLBACK_LAYOUTS[step.count] ?? [];
    expect(layout).toHaveLength(step.count);
    const pods = layout.map(([x, y], index) => ({ id: `pod-${String(index)}`, x, y, size: step.size }));
    expect(problems(pods, step.gap)).toEqual([]);
  });
});

describe('fits', () => {
  const pod = { x: 600, y: 300, size: 200 };
  it.each([
    ['in the open', pod, [], true],
    ['past the left edge', { ...pod, x: 110 }, [], false],
    ['past the right edge', { ...pod, x: 890 }, [], false],
    ['past the top edge', { ...pod, y: 110 }, [], false],
    ['past the bottom edge', { ...pod, y: 490 }, [], false],
    ['next to the exit', { x: 360, y: 240, size: 100 }, [], false],
    ['just clear of the exit', { x: 391, y: 200, size: 100 }, [], true],
    ['touching another pod', pod, [{ x: 830, y: 300, size: 200 }], false],
    ['one gap from another pod', pod, [{ x: 860, y: 340, size: 40 }], true],
  ])('a pod %s fits: %s', (_label, candidate, others, expected) => {
    expect(fits(candidate, others, 40)).toBe(expected);
  });
});
