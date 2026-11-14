import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import { withDefaults } from '../../desktop/parts.ts';
import { nodeAtPath } from '../../model/fileSystem.ts';
import { LESSON_DESKTOP_SIZE } from '../harness/lesson.ts';
import activity from './activity.ts';
import { ALL_APPS, generateLevel, VIEWER_PICTURE, YOUNG_APPS, type OpenCloseLevel } from './level.ts';

const SEEDS = Array.from({ length: 200 }, (_, index) => index * 7_919 + 11);

function rangeOf(band: Band): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error('open-and-close is a rounds activity');
  const range = activity.difficulty[band];
  if (range === undefined) throw new Error(`no range for ${band}`);
  return range;
}

/** What makes a round fair: the named app is on the desktop once, closed, and nothing hides it. */
function problems(level: OpenCloseLevel, pool: readonly string[]): string[] {
  const found: string[] = [];
  if (level.icons.filter((app) => app === level.app).length !== 1) found.push('the target is not shown once');
  if (new Set(level.icons).size !== level.icons.length) found.push('an icon repeats');
  if (level.icons.some((app) => !pool.includes(app))) found.push('an icon is not from the band');
  if (level.openApps.includes(level.app)) found.push('the target is already open');
  const open = level.desktop.windows.map((window) => window.app.kind);
  if (open.toSorted().join() !== [...level.openApps].toSorted().join()) found.push('the open windows differ');
  for (const window of level.desktop.windows) {
    const { x, y, width, height } = window.rect;
    if (x < 0 || y < 0 || x + width > LESSON_DESKTOP_SIZE.width || y + height > LESSON_DESKTOP_SIZE.height) {
      found.push(`${window.id} leaves the lesson desktop`);
    }
    if (window.minimized || window.maximized) found.push(`${window.id} starts minimized or maximized`);
  }
  return found;
}

describe.each([
  ['band-3-5', YOUNG_APPS],
  ['band-6-8', ALL_APPS],
] as const)('open and close for %s', (band, pool) => {
  const { min, max } = rangeOf(band);

  it.each([min, max])('is fair at difficulty %i for every seed', (difficulty) => {
    for (const seed of SEEDS) expect(problems(generateLevel(seed, difficulty, band), pool), `seed ${seed}`).toEqual([]);
  });

  it('adds one icon per step until every app is there, then one open window per step', () => {
    for (let difficulty = min; difficulty <= max; difficulty += 1) {
      const level = generateLevel(SEEDS[0] ?? 1, difficulty, band);
      expect(level.icons).toHaveLength(Math.min(pool.length, difficulty));
      expect(level.openApps).toHaveLength(Math.max(0, difficulty - pool.length));
    }
  });

  it('names every app as the target across seeds', () => {
    const targets = new Set(SEEDS.map((seed) => generateLevel(seed, max, band).app));
    expect([...targets].toSorted()).toEqual([...pool].toSorted());
  });

  it('opens the picture viewer on a picture that is there', () => {
    expect(nodeAtPath(generateLevel(1, min, band).desktop.fs, VIEWER_PICTURE)?.kind).toBe('picture');
  });
});

describe('open and close parts', () => {
  it('gives the youngest band big icons, windows that fill the screen, and only a close button', () => {
    const level = generateLevel(1, 4, 'band-3-5');
    const parts = withDefaults(level.parts);
    expect(parts.windowControls).toEqual(['close']);
    expect([parts.openMaximized, parts.menuBar, parts.taskStrip, parts.move]).toEqual([true, false, false, false]);
    expect(level.desktop.settings.iconSize).toBe('large');
  });

  it('gives band-6-8 every window button to tell apart, and a task strip to bring a window back', () => {
    const parts = withDefaults(generateLevel(1, 3, 'band-6-8').parts);
    expect(parts.windowControls).toEqual(['minimize', 'maximize', 'close']);
    expect(parts.taskStrip).toBe(true);
    expect(parts.launcher).toEqual([]);
  });

  it('builds the lesson desktop at the size every screen shows in full', () => {
    expect(generateLevel(1, 8, 'band-6-8').desktop.size).toEqual(LESSON_DESKTOP_SIZE);
  });
});
