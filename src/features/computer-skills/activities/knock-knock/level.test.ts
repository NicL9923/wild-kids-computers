import { describe, expect, it } from 'vitest';
import {
  DOOR_SHAPE,
  EDGE_MARGIN,
  generateLevel,
  GROUND_Y,
  GUESTS,
  HOUSE,
  isDoubleClick,
  MAX_KNOCK_DIFFICULTY,
  PAINTS,
  STEPS,
  stepFor,
  STREET,
  type KnockLevel,
} from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 3571 + 2);
const DIFFICULTIES = Array.from({ length: MAX_KNOCK_DIFFICULTY }, (_, index) => index + 1);

/** Every rule that makes a street fair, checked from the level alone. */
function problems(level: KnockLevel): string[] {
  const found: string[] = [];
  const halfHouse = (level.width * HOUSE.width) / 2;
  // The house is taller than its door, and the knock dots sit under the door.
  if (level.width * DOOR_SHAPE > level.width * HOUSE.height) found.push('the door is taller than its house');
  if (GROUND_Y - level.width * HOUSE.height < EDGE_MARGIN) found.push('the roofs leave the street');
  if (GROUND_Y + 60 > STREET.height) found.push('no room for the knock dots');
  level.doors.forEach((door, index) => {
    if (door.x - halfHouse < EDGE_MARGIN || door.x + halfHouse > STREET.width - EDGE_MARGIN)
      found.push(`${door.id} leaves the street`);
    const next = level.doors[index + 1];
    // Houses never touch, so two clicks always land on one door.
    if (next !== undefined && next.x - door.x < 2 * halfHouse) found.push(`${door.id} crowds ${next.id}`);
    if (next !== undefined && next.paint === door.paint) found.push(`${door.id} and ${next.id} share a paint`);
  });
  if (new Set(level.doors.map((door) => door.guest)).size !== level.doors.length) found.push('a guest repeats');
  if (new Set(level.doors.map((door) => door.id)).size !== level.doors.length) found.push('a door id repeats');
  return found;
}

describe('generateLevel', () => {
  it.each(DIFFICULTIES)('at difficulty %i gives a fair street for every seed', (difficulty) => {
    const step = stepFor(difficulty);
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      expect(level.doors).toHaveLength(step.count);
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
    }
  });

  it('is generous with time at the easiest and ends at the usual half second', () => {
    expect(generateLevel(1, 1, 'band-6-8').windowMs).toBe(1200);
    expect(generateLevel(1, MAX_KNOCK_DIFFICULTY, 'band-6-8').windowMs).toBe(500);
  });

  it('keeps doors well above the band target at a 1280 by 800 window', () => {
    // A unit is at least one pixel there, and band-6-8's smallest target is 56 pixels.
    expect(Math.min(...STEPS.map((step) => step.width))).toBeGreaterThanOrEqual(2 * 56);
  });

  it('changes by small steps: at most one more door, 15 units narrower, and 200 ms quicker', () => {
    for (let index = 1; index < STEPS.length; index += 1) {
      const before = STEPS[index - 1];
      const after = STEPS[index];
      if (before === undefined || after === undefined) throw new Error('missing step');
      expect(after.count - before.count).toBeGreaterThanOrEqual(0);
      expect(after.count - before.count).toBeLessThanOrEqual(1);
      expect(before.width - after.width).toBeGreaterThan(0);
      expect(before.width - after.width).toBeLessThanOrEqual(15);
      expect(before.windowMs - after.windowMs).toBeGreaterThan(0);
      expect(before.windowMs - after.windowMs).toBeLessThanOrEqual(200);
    }
  });

  it('meets every guest and paint across streets', () => {
    const levels = SEEDS.slice(0, 80).map((seed) => generateLevel(seed, MAX_KNOCK_DIFFICULTY, 'band-6-8'));
    const guests = new Set(levels.flatMap((level) => level.doors.map((door) => door.guest)));
    const paints = new Set(levels.flatMap((level) => level.doors.map((door) => door.paint)));
    expect([...guests].toSorted()).toEqual([...GUESTS].toSorted());
    expect([...paints].toSorted()).toEqual([...PAINTS].toSorted());
  });

  it.each([0, MAX_KNOCK_DIFFICULTY + 1, 2.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-6-8')).toThrow(/difficulty 1 to 6, not/);
  });
});

describe('isDoubleClick', () => {
  it.each([
    ['the first click, even early on the clock', null, 500, false],
    ['a second click at the same moment', 5000, 5000, true],
    ['a second click exactly at the window', 5000, 5800, true],
    ['a second click one millisecond late', 5000, 5801, false],
  ] as const)('counts %s', (_label, previous, now, expected) => {
    expect(isDoubleClick(previous, now, 800)).toBe(expected);
  });
});
