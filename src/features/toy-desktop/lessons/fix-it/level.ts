import { createRandom } from '../../../../core/activityKit/random.ts';
import type { Band } from '../../../../core/bands.ts';
import type { DesktopParts } from '../../desktop/parts.ts';
import { buildDesktop, picture, type WindowSpec } from '../../model/build.ts';
import { applyFault, type Fault } from '../../model/faults.ts';
import type { Rect } from '../../model/geometry.ts';
import type { AppKind, DesktopState } from '../../model/state.ts';
import { LESSON_DESKTOP_SIZE, type LessonLevel } from '../harness/lesson.ts';

/** The problems this lesson poses. A window pushed off to the right is left out: a wide screen shows it. */
export type FaultKind = 'sound-muted' | 'window-minimized' | 'window-behind' | 'window-off-side';

const APPS: readonly AppKind[] = ['notepad', 'picture-viewer', 'file-explorer', 'music-box', 'calculator'];

/** The picture the picture viewer shows. */
const VIEWER_PICTURE = 'Fox';

/**
 * Places for windows that never overlap, so the one window hiding behind another is the only
 * hidden one and "the window behind" is never ambiguous.
 */
const FIRST_SLOT: Rect = { x: 24, y: 24, width: 460, height: 290 };

export const SLOTS: readonly Rect[] = [
  FIRST_SLOT,
  { x: 540, y: 24, width: 460, height: 290 },
  { x: 24, y: 334, width: 460, height: 290 },
];

/** Per difficulty: the problems a round may pose, how many at once, and how many windows are open. */
interface FixItRow {
  readonly kinds: readonly FaultKind[];
  readonly faults: number;
  readonly windows: number;
}

const EASIEST: FixItRow = { kinds: ['sound-muted', 'window-minimized'], faults: 1, windows: 2 };

export const DIFFICULTY: readonly FixItRow[] = [
  EASIEST,
  { kinds: ['window-minimized', 'window-behind'], faults: 1, windows: 2 },
  { kinds: ['sound-muted', 'window-minimized', 'window-behind'], faults: 1, windows: 2 },
  { kinds: ['window-behind', 'window-off-side'], faults: 1, windows: 2 },
  { kinds: ['sound-muted', 'window-minimized', 'window-behind', 'window-off-side'], faults: 1, windows: 3 },
  { kinds: ['sound-muted', 'window-minimized', 'window-behind', 'window-off-side'], faults: 2, windows: 3 },
  { kinds: ['window-minimized', 'window-behind', 'window-off-side'], faults: 2, windows: 3 },
  { kinds: ['sound-muted', 'window-minimized', 'window-behind', 'window-off-side'], faults: 3, windows: 3 },
];

export interface FixItLevel extends LessonLevel {
  /** The problems to fix, in the order they are asked for. */
  readonly faults: readonly Fault[];
}

/** Turns a kind into a fault on the free windows, taking the windows it uses. */
function faultFor(kind: FaultKind, free: string[], random: ReturnType<typeof createRandom>): Fault {
  if (kind === 'sound-muted') return { kind };
  const windowId = random.pick(free);
  free.splice(free.indexOf(windowId), 1);
  if (kind === 'window-minimized') return { kind, windowId };
  if (kind === 'window-off-side') return { kind, windowId, side: 'left' };
  const coveredBy = random.pick(free);
  free.splice(free.indexOf(coveredBy), 1);
  return { kind: 'window-behind', windowId, coveredBy };
}

/** How many windows a kind uses. A window behind another uses two. */
const WINDOWS_USED: Readonly<Record<FaultKind, number>> = {
  'sound-muted': 0,
  'window-minimized': 1,
  'window-off-side': 1,
  'window-behind': 2,
};

/**
 * Kinds for a round: distinct, and together using no more windows than are open. Drawn again
 * until they fit; with three windows and at most two window problems, most draws do.
 */
function kindsFor(row: FixItRow, random: ReturnType<typeof createRandom>): FaultKind[] {
  for (;;) {
    const kinds = random.sample(row.kinds, row.faults);
    const used = kinds.reduce((sum, kind) => sum + WINDOWS_USED[kind], 0);
    if (used <= row.windows) return kinds;
  }
}

/**
 * A few windows in their own places, and one or more problems. Difficulty brings new problems,
 * a third window, and then two or three problems at once.
 */
export function generateLevel(seed: number, difficulty: number, _band: Band): FixItLevel {
  const random = createRandom(seed);
  const row = DIFFICULTY[Math.min(Math.max(difficulty, 1), DIFFICULTY.length) - 1] ?? EASIEST;
  const apps = random.sample(APPS, row.windows);
  const windows: WindowSpec[] = apps.map((app, index) => {
    const slot = SLOTS[index] ?? FIRST_SLOT;
    return {
      ...(app === 'picture-viewer' ? { file: VIEWER_PICTURE } : { app }),
      at: { x: slot.x, y: slot.y },
      size: { width: slot.width, height: slot.height },
    };
  });
  const start = buildDesktop({
    size: LESSON_DESKTOP_SIZE,
    files: { [VIEWER_PICTURE]: picture('fox') },
    windows,
  });
  const free = start.windows.map((window) => window.id);
  const faults = kindsFor(row, random).map((kind) => faultFor(kind, free, random));
  const desktop = faults.reduce<DesktopState>((state, fault) => applyFault(state, fault), start);
  const parts: DesktopParts = {
    icons: [],
    menuBar: false,
    // The sound button shows only when the sound is a problem this round.
    systemSound: faults.some((fault) => fault.kind === 'sound-muted'),
    taskStrip: true,
    launcher: [],
    // No window buttons. A closed window could not be fixed, and a window off the left edge shows
    // only the right end of its title bar, where the buttons would cover the part to grab.
    windowControls: [],
    move: true,
    resize: false,
    openMaximized: false,
  };
  return { faults, parts, desktop };
}
