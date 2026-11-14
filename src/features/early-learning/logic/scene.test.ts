import { describe, expect, it } from 'vitest';
import { createRandom } from '../../../core/activityKit/random.ts';
import { strings as emojiNames } from '../../../core/strings/shared/emoji.ts';
import { makeScene, POOLS, THEMES, type Scene } from './scene.ts';

const SEEDS = Array.from({ length: 100 }, (_, index) => index * 1_009 + 1);

/** What makes a scene fair to cut along its grid: one different picture per cell, each fully in its cell. */
function problems(scene: Scene, columns: number, rows: number): string[] {
  const found: string[] = [];
  const cellWidth = scene.width / columns;
  const cellHeight = scene.height / rows;
  if (new Set(scene.pictures.map((picture) => picture.emoji)).size !== scene.pictures.length)
    found.push('a picture repeats');
  if (scene.pictures.length !== columns * rows)
    found.push(`${String(scene.pictures.length)} pictures for ${String(columns * rows)} cells`);
  const cells = new Set<string>();
  for (const picture of scene.pictures) {
    const column = Math.floor(picture.x / cellWidth);
    const row = Math.floor(picture.y / cellHeight);
    cells.add(`${String(column)},${String(row)}`);
    const half = picture.size / 2;
    // The whole picture stays in its own cell, so a piece cut on the grid shows all of it.
    if (picture.x - half < column * cellWidth - 1 || picture.x + half > (column + 1) * cellWidth + 1)
      found.push(`${picture.emoji} spills sideways`);
    if (picture.y - half < row * cellHeight - 1 || picture.y + half > (row + 1) * cellHeight + 1)
      found.push(`${picture.emoji} spills up or down`);
    // Big enough to see on a piece: more than half the cell's shorter side.
    if (picture.size < Math.min(cellWidth, cellHeight) * 0.55) found.push(`${picture.emoji} is too small`);
  }
  if (cells.size !== columns * rows) found.push('a cell has no picture');
  if (scene.horizon <= cellHeight || scene.horizon >= cellHeight * 1.5)
    found.push('the horizon is not under the sky row');
  return found;
}

describe('POOLS', () => {
  it('holds only bundled pictures, ten for the sky and twenty for the ground in every theme', () => {
    const names: Partial<Record<string, unknown>> = emojiNames;
    for (const theme of THEMES) {
      const { sky, ground } = POOLS[theme];
      expect(sky.length, theme).toBeGreaterThanOrEqual(10);
      expect(ground.length, theme).toBeGreaterThanOrEqual(20);
      for (const picture of [...sky, ...ground]) expect(names[picture], picture).toBeDefined();
      expect(new Set([...sky, ...ground]).size, theme).toBe(sky.length + ground.length);
    }
  });
});

describe('makeScene', () => {
  it.each([
    [1600, 1000, 3, 2],
    [1600, 1000, 6, 4],
    [1200, 800, 3, 2],
    [1600, 1600, 4, 4],
    [1600, 1600, 5, 5],
  ])('cuts a %i by %i scene into %i by %i cells, each with its own picture', (width, height, columns, rows) => {
    for (const seed of SEEDS) {
      const scene = makeScene(createRandom(seed), width, height, columns, rows);
      expect(problems(scene, columns, rows), `seed ${String(seed)}`).toEqual([]);
    }
  });

  it('fills a scene as wide as ten cells, the most sky pictures a theme has', () => {
    expect(problems(makeScene(createRandom(3), 2000, 400, 10, 2), 10, 2)).toEqual([]);
  });

  it('wobbles each picture a little in its cell, so the scene is not a table', () => {
    const offsets = SEEDS.flatMap((seed) =>
      makeScene(createRandom(seed), 1600, 1000, 3, 2).pictures.map((picture) => (picture.x % (1600 / 3)) - 1600 / 6),
    );
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(30);
    const lifts = SEEDS.flatMap((seed) =>
      makeScene(createRandom(seed), 1600, 1000, 3, 2).pictures.map((picture) => (picture.y % 500) - 250),
    );
    expect(Math.max(...lifts) - Math.min(...lifts)).toBeGreaterThan(30);
  });

  it('uses every theme over many scenes', () => {
    const themes = new Set(SEEDS.map((seed) => makeScene(createRandom(seed), 1600, 1000, 3, 2).theme));
    expect([...themes].toSorted()).toEqual([...THEMES].toSorted());
  });

  it.each([
    [11, 2],
    [6, 5],
    [3, 1],
  ])('refuses a %i by %i grid it has no room or pictures for', (columns, rows) => {
    expect(() => makeScene(createRandom(1), 1600, 1000, columns, rows)).toThrow(
      /room for one sky row and 20 ground cells/,
    );
  });
});
