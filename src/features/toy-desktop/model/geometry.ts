/**
 * Window geometry for the toy desktop. Every number is in desktop units: the screen scales the
 * desktop area to fit, so one unit is one CSS pixel at a scale of 1.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

/** The smallest desktop area. A smaller screen scales the desktop down instead. */
export const MIN_DESKTOP_SIZE: Size = { width: 1024, height: 640 };

/** The desktop area most screens show. */
export const DEFAULT_DESKTOP_SIZE: Size = { width: 1280, height: 800 };

/** The smallest window. Smaller sizes clamp to this. */
export const MIN_WINDOW_SIZE: Size = { width: 240, height: 160 };

/** Height of a window's title bar, which the child grabs to move the window. */
export const TITLE_BAR_HEIGHT = 48;

/**
 * How much of the title bar must stay on the desktop, side to side. It is wide enough for a
 * 3-year-old to grab, whatever the band's target size.
 */
export const MIN_VISIBLE_TITLE_BAR = 120;

/** Where the first window opens, and how far each next window steps down and right. */
const CASCADE_ORIGIN = { x: 48, y: 32 };
export const CASCADE_STEP = 32;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Rounds to whole units and raises a desktop size to the minimum. */
export function clampDesktopSize(size: Size): Size {
  return {
    width: Math.max(Math.round(size.width), MIN_DESKTOP_SIZE.width),
    height: Math.max(Math.round(size.height), MIN_DESKTOP_SIZE.height),
  };
}

/** Clamps a window size between the minimum window and the whole desktop. */
export function clampWindowSize(size: Size, desktop: Size): Size {
  return {
    width: clamp(Math.round(size.width), MIN_WINDOW_SIZE.width, desktop.width),
    height: clamp(Math.round(size.height), MIN_WINDOW_SIZE.height, desktop.height),
  };
}

/**
 * Keeps a window reachable. The whole title bar stays within the desktop from top to bottom,
 * and at least `MIN_VISIBLE_TITLE_BAR` of it stays on the desktop from side to side.
 */
export function clampWindowPosition(rect: Rect, desktop: Size): Rect {
  return {
    ...rect,
    x: clamp(Math.round(rect.x), MIN_VISIBLE_TITLE_BAR - rect.width, desktop.width - MIN_VISIBLE_TITLE_BAR),
    y: clamp(Math.round(rect.y), 0, desktop.height - TITLE_BAR_HEIGHT),
  };
}

/** Clamps the size first, then the position, so the result is always reachable. */
export function clampWindowRect(rect: Rect, desktop: Size): Rect {
  return clampWindowPosition({ ...rect, ...clampWindowSize(rect, desktop) }, desktop);
}

/** The rectangle a maximized window covers: the whole desktop. */
export function fullRect(desktop: Size): Rect {
  return { x: 0, y: 0, width: desktop.width, height: desktop.height };
}

/** The share of a rectangle's area that lies on the desktop, from 0 to 1. */
export function visibleFraction(rect: Rect, desktop: Size): number {
  const width = Math.min(rect.x + rect.width, desktop.width) - Math.max(rect.x, 0);
  const height = Math.min(rect.y + rect.height, desktop.height) - Math.max(rect.y, 0);
  if (width <= 0 || height <= 0) return 0;
  return (width * height) / (rect.width * rect.height);
}

/**
 * Where a new window of the given size opens. Windows cascade down and to the right from the
 * top left, skipping a place where another window's corner already sits, and start over at the
 * top left when the next place would push the window off the desktop.
 */
export function cascadeRect(size: Size, desktop: Size, taken: readonly Rect[]): Rect {
  const clamped = clampWindowSize(size, desktop);
  const room = Math.min(
    desktop.width - clamped.width - CASCADE_ORIGIN.x,
    desktop.height - clamped.height - CASCADE_ORIGIN.y,
  );
  const places = Math.max(1, Math.floor(room / CASCADE_STEP) + 1);
  const placeAt = (index: number): Rect =>
    clampWindowPosition(
      {
        x: CASCADE_ORIGIN.x + index * CASCADE_STEP,
        y: CASCADE_ORIGIN.y + index * CASCADE_STEP,
        ...clamped,
      },
      desktop,
    );
  for (let index = 0; index < places; index += 1) {
    const place = placeAt(index);
    if (!taken.some((rect) => rect.x === place.x && rect.y === place.y)) return place;
  }
  return placeAt(taken.length % places);
}
