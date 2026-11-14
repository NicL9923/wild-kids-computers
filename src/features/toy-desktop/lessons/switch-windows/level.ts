import { createRandom } from '../../../../core/activityKit/random.ts';
import type { Band } from '../../../../core/bands.ts';
import type { DesktopParts } from '../../desktop/parts.ts';
import { buildDesktop, picture, type WindowSpec } from '../../model/build.ts';
import type { AppKind } from '../../model/state.ts';
import { LESSON_DESKTOP_SIZE, type LessonLevel } from '../harness/lesson.ts';

/** Apps with a look of their own, so each window is easy to tell apart. */
export const APPS: readonly AppKind[] = ['notepad', 'picture-viewer', 'file-explorer', 'music-box', 'calculator'];

/** The picture the picture viewer shows. */
export const VIEWER_PICTURE = 'Fox';

/**
 * How the window to find is hidden. `behind`: other windows overlap it. `minimized`: it is down in
 * the task strip. `under-maximized`: a window in front fills the whole screen.
 */
export type Hiding = 'behind' | 'minimized' | 'under-maximized';

/** What the child does once the window is in front. */
export type FinishStep = 'maximize' | 'minimize';

export interface SwitchLevel extends LessonLevel {
  /** The app whose window the child brings to the front. */
  readonly target: AppKind;
  /** The open apps, back to front. */
  readonly apps: readonly AppKind[];
  readonly hiding: Hiding;
  /** Done in order after the window is in front. */
  readonly finish: readonly FinishStep[];
}

/** Open windows at difficulty 1 to 7. Each step changes one thing: this, the hiding, or the finish. */
const WINDOW_COUNTS = [2, 3, 3, 4, 4, 4, 5] as const;

export function windowCount(difficulty: number): number {
  return WINDOW_COUNTS[Math.min(Math.max(difficulty, 1), WINDOW_COUNTS.length) - 1] ?? APPS.length;
}

/** Overlapping at first, then down in the strip, then under a window that fills the screen. */
export function hidingFor(difficulty: number): Hiding {
  if (difficulty <= 2) return 'behind';
  if (difficulty <= 5) return 'minimized';
  return 'under-maximized';
}

/** Windows cascade from the top left, each a title bar and more down and well across, so every title shows. */
function windowAt(index: number): { x: number; y: number } {
  return { x: 24 + index * 110, y: 24 + index * 64 };
}

const WINDOW_SIZE = { width: 520, height: 340 };

const PARTS: DesktopParts = {
  icons: [],
  menuBar: false,
  taskStrip: true,
  launcher: [],
  // No close button: a closed window could not be found again.
  windowControls: ['minimize', 'maximize'],
  move: true,
  resize: false,
  openMaximized: false,
  systemSound: false,
};

/**
 * Several windows overlap, and the one the child hears is hidden. Difficulty adds windows, hides
 * the target more deeply, and from 5 adds a last step that puts the window away again. One thing
 * changes at each step.
 */
export function generateLevel(seed: number, difficulty: number, _band: Band): SwitchLevel {
  const random = createRandom(seed);
  const apps = random.sample(APPS, windowCount(difficulty));
  const hiding = hidingFor(difficulty);
  // The target is never the front window. Behind, it is anywhere but the front.
  const target = random.pick(apps.slice(0, -1));
  const front = apps.length - 1;
  const windows: WindowSpec[] = apps.map((app, index) => ({
    ...(app === 'picture-viewer' ? { file: VIEWER_PICTURE } : { app }),
    at: windowAt(index),
    size: WINDOW_SIZE,
    minimized: hiding === 'minimized' && app === target,
    maximized: hiding === 'under-maximized' && index === front,
  }));
  return {
    target,
    apps,
    hiding,
    finish: difficulty >= 5 ? ['maximize', 'minimize'] : ['maximize'],
    parts: PARTS,
    desktop: buildDesktop({
      size: LESSON_DESKTOP_SIZE,
      files: { [VIEWER_PICTURE]: picture('fox') },
      windows,
    }),
  };
}
