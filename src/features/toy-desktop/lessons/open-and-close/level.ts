import { createRandom } from '../../../../core/activityKit/random.ts';
import type { Band } from '../../../../core/bands.ts';
import type { DesktopParts } from '../../desktop/parts.ts';
import { buildDesktop, picture, type WindowSpec } from '../../model/build.ts';
import type { AppKind } from '../../model/state.ts';
import { LESSON_DESKTOP_SIZE, type LessonLevel } from '../harness/lesson.ts';

/** Apps a 3-year-old knows by their picture alone. */
export const YOUNG_APPS: readonly AppKind[] = ['music-box', 'picture-viewer', 'notepad'];
export const ALL_APPS: readonly AppKind[] = ['notepad', 'picture-viewer', 'file-explorer', 'music-box', 'calculator'];

/** The picture the picture viewer opens, so a young child sees a fox rather than an empty window. */
export const VIEWER_PICTURE = 'Fox';

export interface OpenCloseLevel extends LessonLevel {
  /** The app to open and then close. */
  readonly app: AppKind;
  /** The app icons on the desktop, top to bottom. The target is one of them. */
  readonly icons: readonly AppKind[];
  /** Apps already open in windows when the round starts. Never the target. */
  readonly openApps: readonly AppKind[];
}

/** Already-open windows: on the left, clear of the icons at the right edge, each a step apart. */
function windowAt(index: number): { x: number; y: number } {
  return { x: 24 + index * 80, y: 24 + index * 70 };
}

/** Big enough to show what each app is, small enough that three fit beside the icons. */
const OPEN_WINDOW_SIZE = { width: 480, height: 360 };

function parts(band: Band, icons: readonly AppKind[]): DesktopParts {
  const iconSpecs = icons.map((app) => (app === 'picture-viewer' ? { app, file: VIEWER_PICTURE } : { app }));
  if (band === 'band-3-5') {
    return {
      icons: iconSpecs,
      menuBar: false,
      taskStrip: false,
      launcher: [],
      windowControls: ['close'],
      move: false,
      resize: false,
      openMaximized: true,
      systemSound: false,
    };
  }
  return { icons: iconSpecs, launcher: [], resize: false, systemSound: false };
}

/**
 * Difficulty adds one app icon at a time until every app of the band is on the desktop, then
 * one already-open window at a time, which the child must leave alone.
 */
export function generateLevel(seed: number, difficulty: number, band: Band): OpenCloseLevel {
  const random = createRandom(seed);
  const pool = band === 'band-3-5' ? YOUNG_APPS : ALL_APPS;
  const icons = random.sample(pool, Math.min(pool.length, difficulty));
  const app = random.pick(icons);
  const openApps = icons.filter((other) => other !== app).slice(0, Math.max(0, difficulty - pool.length));
  const windows: WindowSpec[] = openApps.map((other, index) => ({
    ...(other === 'picture-viewer' ? { file: VIEWER_PICTURE } : { app: other }),
    at: windowAt(index),
    size: OPEN_WINDOW_SIZE,
  }));
  return {
    app,
    icons,
    openApps,
    parts: parts(band, icons),
    desktop: buildDesktop({
      size: LESSON_DESKTOP_SIZE,
      files: { [VIEWER_PICTURE]: picture('fox') },
      windows,
      settings: { iconSize: band === 'band-3-5' ? 'large' : 'medium' },
    }),
  };
}
