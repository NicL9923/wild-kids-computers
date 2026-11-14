import { describe, expect, it } from 'vitest';
import type { Random } from '../../../../core/activityKit/random.ts';
import {
  buttonsWithSwitches,
  chooseButtons,
  generateLevel,
  MAX_BUTTONS_DIFFICULTY,
  STEPS,
  stepFor,
  THINGS,
  type MouseButton,
} from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 48_271 + 9);
const DIFFICULTIES = Array.from({ length: MAX_BUTTONS_DIFFICULTY }, (_, index) => index + 1);

function switchesIn(buttons: readonly MouseButton[]): number {
  return buttons.filter((button, index) => index > 0 && button !== buttons[index - 1]).length;
}

describe('generateLevel', () => {
  it.each(DIFFICULTIES)('at difficulty %i gives a fair run of things for every seed', (difficulty) => {
    const step = stepFor(difficulty);
    for (const seed of SEEDS) {
      const { things } = generateLevel(seed, difficulty, 'band-9-12');
      const buttons = things.map((thing) => thing.button);
      expect(things).toHaveLength(step.count);
      expect(switchesIn(buttons), `seed ${String(seed)}`).toBe(step.switches);
      // Each button gets at least a third of the things.
      const rights = buttons.filter((button) => button === 'right').length;
      expect(rights).toBeGreaterThanOrEqual(Math.floor(step.count / 3));
      expect(step.count - rights).toBeGreaterThanOrEqual(Math.floor(step.count / 3));
      expect(new Set(things.map((thing) => thing.picture)).size).toBe(step.count);
      expect(new Set(things.map((thing) => thing.id)).size).toBe(step.count);
    }
  });

  it('starts with one change of button, in two blocks, in band-6-8', () => {
    const { things } = generateLevel(11, 1, 'band-6-8');
    expect(things).toHaveLength(4);
    expect(switchesIn(things.map((thing) => thing.button))).toBe(1);
  });

  it('starts with either button, and uses every thing across rounds', () => {
    const levels = SEEDS.slice(0, 100).map((seed) => generateLevel(seed, 9, 'band-9-12'));
    expect(new Set(levels.map((level) => level.things[0]?.button)).size).toBe(2);
    expect(new Set(levels.flatMap((level) => level.things.map((thing) => thing.picture))).size).toBe(THINGS.length);
    expect(new Set(levels.map((level) => level.things.map((thing) => thing.button).join())).size).toBeGreaterThan(50);
  });

  it('changes by small steps: at most one more thing and one more change of button', () => {
    for (let index = 1; index < STEPS.length; index += 1) {
      const before = STEPS[index - 1];
      const after = STEPS[index];
      if (before === undefined || after === undefined) throw new Error('missing step');
      expect(after.count - before.count).toBeGreaterThanOrEqual(0);
      expect(after.count - before.count).toBeLessThanOrEqual(1);
      expect(after.switches - before.switches).toBeGreaterThanOrEqual(0);
      expect(after.switches - before.switches).toBeLessThanOrEqual(1);
      expect(after.count + after.switches).toBeGreaterThan(before.count + before.switches);
    }
  });

  it.each([0, MAX_BUTTONS_DIFFICULTY + 1, 4.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-6-8')).toThrow(/difficulty 1 to 9, not/);
  });
});

describe('buttonsWithSwitches', () => {
  it('changes button at each gap', () => {
    expect(buttonsWithSwitches('left', 5, [2, 4])).toEqual(['left', 'left', 'right', 'right', 'left']);
    expect(buttonsWithSwitches('right', 3, [])).toEqual(['right', 'right', 'right']);
  });
});

/** A generator whose samples always take the first gaps, so every run is lopsided. */
const lopsided: Random = {
  next: () => 0.1,
  int: (min) => min,
  pick: (items) => {
    for (const item of items) return item;
    throw new RangeError('empty');
  },
  shuffle: (items) => [...items],
  sample: (items, count) => items.slice(0, count),
};

describe('chooseButtons', () => {
  it.each(STEPS.map((step, index) => [index + 1, step] as const))(
    'at difficulty %i spreads the changes evenly when random runs are lopsided',
    (_difficulty, step) => {
      const buttons = chooseButtons(lopsided, step);
      expect(buttons).toHaveLength(step.count);
      expect(switchesIn(buttons)).toBe(step.switches);
      const rights = buttons.filter((button) => button === 'right').length;
      expect(Math.min(rights, step.count - rights)).toBeGreaterThanOrEqual(Math.floor(step.count / 3));
    },
  );

  it('falls back to the even spread for six things with two changes', () => {
    expect(chooseButtons(lopsided, { count: 6, switches: 2 })).toEqual([
      'left',
      'left',
      'right',
      'right',
      'left',
      'left',
    ]);
  });
});
