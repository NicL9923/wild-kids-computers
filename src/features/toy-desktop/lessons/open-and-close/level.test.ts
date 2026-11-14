import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import { withDefaults } from '../../desktop/parts.ts';
import { nodeAtPath } from '../../model/fileSystem.ts';
import { pictureSource } from '../../desktop/labels.ts';
import { LESSON_DESKTOP_SIZE } from '../harness/lesson.ts';
import activity from './activity.ts';
import { ALL_APPS, generateLevel, VIEWER_PICTURE, YOUNG_APPS, type OpenCloseLevel } from './level.ts';

/** Room the icon column needs at the right edge, in desktop units. */
const ICON_ROOM = 320;
/** How far each open window steps from the last, at least: more than a cascade's 32 units. */
const STEP_APART = 48;

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
  const shown = (level.parts?.icons ?? []).map((icon) => ('app' in icon ? icon.app : null));
  if (shown.join() !== level.icons.join()) found.push('the desktop shows other icons than the level names');
  const open = level.desktop.windows.map((window) => window.app.kind);
  if (open.toSorted().join() !== [...level.openApps].toSorted().join()) found.push('the open windows differ');
  for (const window of level.desktop.windows) {
    const { x, y, width, height } = window.rect;
    if (x < 0 || y < 0 || x + width > LESSON_DESKTOP_SIZE.width || y + height > LESSON_DESKTOP_SIZE.height) {
      found.push(`${window.id} leaves the lesson desktop`);
    }
    if (window.minimized || window.maximized) found.push(`${window.id} starts minimized or maximized`);
    // Icons stand at the right edge; an open window leaves them a column of room.
    if (x + width > LESSON_DESKTOP_SIZE.width - ICON_ROOM) found.push(`${window.id} covers the icons`);
  }
  // Each window sits a step away from the last, so every title bar and close button stays in view.
  level.desktop.windows.forEach((window, index) => {
    const before = level.desktop.windows[index - 1];
    if (before === undefined) return;
    if (window.rect.x - before.rect.x < STEP_APART || window.rect.y - before.rect.y < STEP_APART) {
      found.push(`${window.id} hides the title bar of ${before.id}`);
    }
  });
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

  it('opens the picture viewer on a bundled picture, from its icon or as an open window', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const level = generateLevel(seed, max, band);
      const fox = nodeAtPath(level.desktop.fs, VIEWER_PICTURE);
      if (fox?.kind !== 'picture') throw new Error('The picture to open is missing');
      expect(pictureSource(fox.pictureId).kind).toBe('emoji');
      for (const icon of level.parts?.icons ?? []) {
        const opensFile = 'file' in icon ? icon.file : undefined;
        expect(opensFile).toBe('app' in icon && icon.app === 'picture-viewer' ? VIEWER_PICTURE : undefined);
      }
      const viewers = level.desktop.windows.flatMap((window) =>
        window.app.kind === 'picture-viewer' ? [window.app.fileId] : [],
      );
      expect(viewers.every((fileId) => fileId === fox.id)).toBe(true);
    }
  });
});

describe('open and close parts', () => {
  it('gives the youngest band big icons, windows that fill the screen, and only a close button', () => {
    const level = generateLevel(1, 4, 'band-3-5');
    const { icons: _icons, ...parts } = withDefaults(level.parts);
    expect(parts).toEqual({
      menuBar: false,
      taskStrip: false,
      launcher: [],
      windowControls: ['close'],
      move: false,
      resize: false,
      openMaximized: true,
      systemSound: false,
      hiddenCommands: [],
    });
    expect(level.desktop.settings.iconSize).toBe('large');
  });

  it('gives band-6-8 every window button to tell apart, and only what opening and closing need', () => {
    const level = generateLevel(1, 3, 'band-6-8');
    const { icons: _icons, ...parts } = withDefaults(level.parts);
    expect(parts).toEqual({
      menuBar: true,
      taskStrip: true,
      launcher: [],
      windowControls: ['minimize', 'maximize', 'close'],
      move: true,
      resize: false,
      openMaximized: false,
      systemSound: false,
      hiddenCommands: [],
    });
    expect(level.desktop.settings.iconSize).toBe('medium');
  });

  it('builds the lesson desktop at the size every screen shows in full', () => {
    expect(generateLevel(1, 8, 'band-6-8').desktop.size).toEqual(LESSON_DESKTOP_SIZE);
  });
});
