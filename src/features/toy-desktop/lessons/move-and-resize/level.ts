import { createRandom } from '../../../../core/activityKit/random.ts';
import type { Band } from '../../../../core/bands.ts';
import type { DesktopParts } from '../../desktop/parts.ts';
import { buildDesktop, picture, type WindowSpec } from '../../model/build.ts';
import { MIN_WINDOW_SIZE, type Rect } from '../../model/geometry.ts';
import type { DesktopState } from '../../model/state.ts';
import { LESSON_DESKTOP_SIZE, type LessonLevel } from '../harness/lesson.ts';

/** The picture the window shows, so it is easy to tell which window is the one to move. */
export const WINDOW_PICTURE = 'Fox';

/** The window's size when the round starts, in desktop units. */
export const START_SIZE = { width: 360, height: 260 } as const;

/** Room kept between a mark and the desktop's edge, so the whole mark is always in view. */
export const EDGE = 24;

/** The gap between the window at its start and the dashed boxes, so the boxes never hide under it. */
export const GAP = 24;

export interface MoveResizeLevel extends LessonLevel {
  /** Where the window starts. */
  readonly start: Rect;
  /** The dashed box to move the window into: the window's size, somewhere else. */
  readonly place: Rect;
  /** The dashed box to resize the window to: the same top left as `place`, another size. */
  readonly outline: Rect;
  /** How far, in desktop units, each edge may be from the box and still fit. */
  readonly tolerance: number;
}

/**
 * Closer fits at higher difficulty. 52 units at the easiest is about a fingertip on a trackpad;
 * 16 at the hardest is still more than half an arrow key step, so the keyboard can always fit it.
 */
export function toleranceFor(difficulty: number): number {
  return Math.max(16, 56 - 4 * difficulty);
}

/** How much the size changes: one side at low difficulty, then both, by more as it rises. */
function sizeChange(difficulty: number, random: ReturnType<typeof createRandom>): { width: number; height: number } {
  const amount = 80 + difficulty * 8;
  const width = random.pick([-1, 1]) * amount;
  if (difficulty <= 3) return { width, height: 0 };
  return { width, height: random.pick([-1, 1]) * Math.round(amount * 0.6) };
}

/** True when the window's top left is within the tolerance of the box's, and it is not maximized. */
export function isInPlace(state: DesktopState, place: Rect, tolerance: number): boolean {
  const window = state.windows[0];
  if (window === undefined || window.maximized || window.minimized) return false;
  return Math.abs(window.rect.x - place.x) <= tolerance && Math.abs(window.rect.y - place.y) <= tolerance;
}

/** True when the window fills the outline: its place and its size are each within the tolerance. */
export function fitsOutline(state: DesktopState, outline: Rect, tolerance: number): boolean {
  const window = state.windows[0];
  if (window === undefined || !isInPlace(state, outline, tolerance)) return false;
  return (
    Math.abs(window.rect.width - outline.width) <= tolerance &&
    Math.abs(window.rect.height - outline.height) <= tolerance
  );
}

const PARTS: DesktopParts = {
  icons: [],
  menuBar: false,
  taskStrip: false,
  launcher: [],
  // No buttons: a minimized window with no task strip could not come back.
  windowControls: [],
  move: true,
  resize: true,
  openMaximized: false,
  systemSound: false,
};

/**
 * One window showing a fox. The child moves it into a dashed box, then pulls its corner to fit a
 * second box. Difficulty asks for a closer fit and a bigger change of size, on both sides from 4.
 */
export function generateLevel(seed: number, difficulty: number, _band: Band): MoveResizeLevel {
  const random = createRandom(seed);
  const { width: deskWidth, height: deskHeight } = LESSON_DESKTOP_SIZE;
  const change = sizeChange(difficulty, random);
  const target = {
    width: Math.max(MIN_WINDOW_SIZE.width, START_SIZE.width + change.width),
    height: Math.max(MIN_WINDOW_SIZE.height, START_SIZE.height + change.height),
  };
  // Room for both boxes, which share a top left corner.
  const room = { width: Math.max(START_SIZE.width, target.width), height: Math.max(START_SIZE.height, target.height) };
  // The window and the boxes stand side by side with a gap, and the spare width falls anywhere.
  const spare = deskWidth - 2 * EDGE - GAP - START_SIZE.width - room.width;
  const before = random.int(0, spare);
  const between = random.int(0, spare - before);
  const windowX = EDGE + before;
  const placeX = windowX + START_SIZE.width + GAP + between;
  // Half the rounds mirror it, so the window starts on the right and moves left.
  const mirrored = random.pick([false, true]);
  const side = (x: number, width: number) => (mirrored ? deskWidth - x - width : x);
  const start: Rect = {
    x: side(windowX, START_SIZE.width),
    y: random.int(EDGE, deskHeight - EDGE - START_SIZE.height),
    ...START_SIZE,
  };
  const corner = {
    x: side(placeX, room.width),
    y: random.int(EDGE, deskHeight - EDGE - room.height),
  };
  const windowSpec: WindowSpec = { file: WINDOW_PICTURE, at: { x: start.x, y: start.y }, size: START_SIZE };
  return {
    start,
    place: { ...corner, ...START_SIZE },
    outline: { ...corner, ...target },
    tolerance: toleranceFor(difficulty),
    parts: PARTS,
    desktop: buildDesktop({
      size: LESSON_DESKTOP_SIZE,
      files: { [WINDOW_PICTURE]: picture('fox') },
      windows: [windowSpec],
    }),
  };
}
