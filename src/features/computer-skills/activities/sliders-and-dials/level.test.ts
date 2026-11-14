import { describe, expect, it } from 'vitest';
import type { Random } from '../../../../core/activityKit/random.ts';
import { CONTROL_COLORS, generateLevel, MAX_DIAL_DIFFICULTY, MIN_MOVE, startAndTarget, STEPS } from './level.ts';

const SEEDS = Array.from({ length: 400 }, (_, index) => index * 2_654_435 + 5);
const DIFFICULTIES = Array.from({ length: MAX_DIAL_DIFFICULTY }, (_, index) => index + 1);

describe('generateLevel', () => {
  it.each(DIFFICULTIES)('at difficulty %i gives controls that start away from a flag on the track', (difficulty) => {
    const step = STEPS[difficulty - 1];
    for (const seed of SEEDS) {
      const { controls } = generateLevel(seed, difficulty, 'band-6-8');
      expect(controls.map((control) => control.kind)).toEqual(step?.kinds);
      expect(new Set(controls.map((control) => control.color)).size, 'each control has its own color').toBe(
        controls.length,
      );
      expect(new Set(controls.map((control) => control.id)).size).toBe(controls.length);
      for (const control of controls) {
        expect(CONTROL_COLORS).toContain(control.color);
        expect(control.stops).toBe(step?.stops);
        for (const value of [control.start, control.target]) {
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(control.stops);
        }
        expect(Math.abs(control.start - control.target), `seed ${String(seed)}`).toBeGreaterThanOrEqual(MIN_MOVE);
      }
    }
  });

  it('starts with one slider of five stops and grows by one change per difficulty', () => {
    expect(STEPS.map((step) => `${step.kinds.join('+')} ${String(step.stops)}`)).toEqual([
      'slider 5',
      'slider 7',
      'dial 7',
      'slider+dial 7',
      'slider+dial 9',
      'slider+slider+dial 9',
      'slider+dial+dial 11',
    ]);
  });

  it('puts flags at every stop, the ends included, across seeds', () => {
    const targets = new Set(SEEDS.map((seed) => generateLevel(seed, 1, 'band-6-8').controls[0]?.target));
    expect([...targets].toSorted((a = 0, b = 0) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it.each([0, MAX_DIAL_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-6-8')).toThrow(/difficulty 1 to 7, not/);
  });
});

/** A generator whose int and pick always take the given end of the range. */
const edge = (end: 'low' | 'high'): Random => ({
  next: () => 0,
  int: (min, max) => (end === 'low' ? min : max),
  pick: (items) => {
    const item = end === 'low' ? items[0] : items.at(-1);
    if (item === undefined) throw new RangeError('empty');
    return item;
  },
  shuffle: (items) => [...items],
  sample: (items, count) => items.slice(0, count),
});

describe('startAndTarget', () => {
  it.each([
    ['low', { target: 0, start: 2 }],
    ['high', { target: 4, start: 2 }],
  ] as const)('keeps the start two stops from a flag at the %s end', (end, expected) => {
    expect(startAndTarget(edge(end), 5)).toEqual(expected);
  });
});
