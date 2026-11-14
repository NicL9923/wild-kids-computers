import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import activity from './activity.ts';
import { generateLevel, MAX_DIFFICULTY, PICTURE, type JigsawLevel } from './level.ts';

const SEEDS = Array.from({ length: 200 }, (_, index) => index * 5_303 + 23);

/**
 * What makes a jigsaw fair: every piece in the tray once, not in home order, and every piece shows
 * at least one whole picture of its own, so the child can tell where it goes.
 */
function problems(level: JigsawLevel): string[] {
  const found: string[] = [];
  const count = level.columns * level.rows;
  if ([...level.tray].toSorted((a, b) => a - b).join() !== Array.from({ length: count }, (_, index) => index).join()) {
    found.push('the tray is not every piece once');
  }
  if (level.tray.every((piece, index) => piece === index)) found.push('the tray is in home order');
  if (level.gallery !== null && (level.gallery < 0 || level.gallery >= 1))
    found.push('the gallery pick is not a fraction');
  const width = PICTURE.width / level.columns;
  const height = PICTURE.height / level.rows;
  if (level.scene.width !== PICTURE.width || level.scene.height !== PICTURE.height)
    found.push('the scene is not the picture size');
  for (let piece = 0; piece < count; piece += 1) {
    const left = (piece % level.columns) * width;
    const top = Math.floor(piece / level.columns) * height;
    const whole = level.scene.pictures.filter(
      (picture) =>
        picture.x - picture.size / 2 >= left - 1 &&
        picture.x + picture.size / 2 <= left + width + 1 &&
        picture.y - picture.size / 2 >= top - 1 &&
        picture.y + picture.size / 2 <= top + height + 1,
    );
    if (whole.length === 0) found.push(`piece ${String(piece)} shows no whole picture`);
  }
  return found;
}

describe('generateLevel', () => {
  // The design: pieces across and down, and the faint guide, per difficulty.
  it.each([
    [1, 2, 1, true],
    [2, 2, 2, true],
    [3, 2, 2, false],
    [4, 3, 2, true],
    [5, 3, 2, false],
    [6, 3, 3, false],
    [7, 4, 3, false],
    [8, 4, 4, false],
    [9, 5, 4, false],
    [10, 6, 4, false],
  ])(
    'at difficulty %i cuts the picture %i across and %i down, guide %s, fairly for every seed',
    (difficulty, columns, rows, guide) => {
      for (const seed of SEEDS) {
        const level = generateLevel(seed, difficulty, 'band-6-8');
        expect(problems(level), `seed ${String(seed)}`).toEqual([]);
        expect([level.columns, level.rows, level.guide]).toEqual([columns, rows, guide]);
      }
    },
  );

  it("stays fair at both ends of every band's range", () => {
    if (activity.kind !== 'rounds') throw new Error('jigsaw is a rounds activity');
    for (const [band, range] of Object.entries(activity.difficulty) as [Band, { min: number; max: number }][]) {
      for (const difficulty of [range.min, range.max]) {
        for (const seed of SEEDS.slice(0, 50)) expect(problems(generateLevel(seed, difficulty, band))).toEqual([]);
      }
    }
  });

  it('offers a painting from the gallery in about half the rounds, from anywhere in the list', () => {
    const picks = SEEDS.map((seed) => generateLevel(seed, 3, 'band-3-5').gallery);
    const offered = picks.filter((pick): pick is number => pick !== null);
    expect(offered.length).toBeGreaterThan(SEEDS.length * 0.35);
    expect(offered.length).toBeLessThan(SEEDS.length * 0.65);
    expect(Math.min(...offered)).toBeLessThan(0.2);
    expect(Math.max(...offered)).toBeGreaterThan(0.8);
  });

  it('never hands over two pieces in home order, even when the shuffle does', () => {
    // Two pieces shuffle into home order half the time; every tray still starts mixed.
    for (const seed of SEEDS) expect(generateLevel(seed, 1, 'band-3-5').tray).toEqual([1, 0]);
  });

  it.each([0, MAX_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 10, not/);
  });
});
