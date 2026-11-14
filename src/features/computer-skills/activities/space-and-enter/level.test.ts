import { describe, expect, it } from 'vitest';
import activity from './activity.ts';
import {
  CRITTERS,
  EARLY_WINDOW,
  FIRST_STOP_X,
  generateLevel,
  LAST_STOP_X,
  MAX_JUMP_DIFFICULTY,
  PATH,
  STAND_GAP,
  START_X,
  STEPS,
} from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 4513 + 2);
const DIFFICULTIES = Array.from({ length: MAX_JUMP_DIFFICULTY }, (_, index) => index + 1);

describe('generateLevel', () => {
  it.each(DIFFICULTIES)('at difficulty %i lays out a fair path for every seed', (difficulty) => {
    const step = STEPS[difficulty - 1];
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      const kinds = level.stops.map((stop) => stop.kind);
      expect(kinds[0], 'Space comes first').toBe('jump');
      expect(kinds.at(-1)).toBe('home');
      expect(kinds.filter((kind) => kind === 'home')).toHaveLength(1);
      expect(kinds.filter((kind) => kind === 'jump')).toHaveLength(step?.jumps ?? -1);
      expect(kinds.filter((kind) => kind === 'gate')).toHaveLength(step?.gates ?? -1);
      expect(CRITTERS).toContain(level.critter);
      for (const stop of level.stops) expect(stop.thing === null).toBe(stop.kind !== 'jump');
      // Room to walk before the first stop, and every landing is short of the next place to wait.
      expect((level.stops[0]?.x ?? 0) - STAND_GAP).toBeGreaterThan(START_X);
      level.stops.slice(1).forEach((stop, index) => {
        const before = level.stops[index]?.x ?? Infinity;
        expect(stop.x - STAND_GAP - (before + STAND_GAP), `seed ${String(seed)}`).toBeGreaterThan(0);
      });
      expect(level.stops.at(-1)?.x).toBe(LAST_STOP_X);
      expect(LAST_STOP_X + STAND_GAP).toBeLessThan(PATH.width);
    }
  });

  it('waits for the child at every difficulty the youngest band plays', () => {
    const range = activity.kind === 'rounds' ? activity.difficulty['band-3-5'] : undefined;
    for (let difficulty = range?.min ?? 1; difficulty <= (range?.max ?? 0); difficulty += 1) {
      expect(generateLevel(1, difficulty, 'band-3-5').walk).toBe('waits');
    }
  });

  it('walks slowly when it keeps walking, so the early window lasts more than a second', () => {
    for (const step of STEPS.filter((item) => item.walk === 'keeps-walking')) {
      expect((EARLY_WINDOW / step.speed) * 1000).toBeGreaterThan(1000);
    }
  });

  it('changes one or two things per difficulty', () => {
    expect(
      STEPS.map((step) => `${String(step.jumps)}j ${String(step.gates)}g ${step.walk} ${String(step.speed)}`),
    ).toEqual([
      '1j 0g waits 160',
      '2j 0g waits 160',
      '1j 1g waits 160',
      '2j 1g waits 160',
      '2j 1g keeps-walking 110',
      '3j 1g keeps-walking 110',
      '3j 1g keeps-walking 140',
      '2j 2g keeps-walking 140',
    ]);
  });

  it('mixes the order of jumps and gates from seed to seed', () => {
    const orders = new Set(
      SEEDS.slice(0, 60).map((seed) =>
        generateLevel(seed, 6, 'band-6-8')
          .stops.map((stop) => stop.kind)
          .join(),
      ),
    );
    expect(orders.size).toBe(3);
    expect(FIRST_STOP_X).toBeLessThan(LAST_STOP_X);
  });

  it.each([0, MAX_JUMP_DIFFICULTY + 1, 3.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 8, not/);
  });
});
