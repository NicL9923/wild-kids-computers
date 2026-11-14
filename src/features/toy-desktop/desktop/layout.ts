/**
 * How the toy desktop fits the space it gets. The model's desktop is at least 1024 by 640 units;
 * the screen picks one scale that fits that minimum into the space, then widens or heightens the
 * desktop to fill what is left, so nothing is clipped and no space is wasted. A lesson that
 * places its windows inside 1024 by 640 is fully visible on every screen.
 */
import { MIN_DESKTOP_SIZE, type Rect, type Size } from '../model/geometry.ts';
import type { AppKind } from '../model/state.ts';

/** @public */
export interface DesktopFit {
  /** CSS pixels per desktop unit. */
  scale: number;
  /** The desktop size in units, never below the model's minimum. */
  size: Size;
}

/** The scale and desktop size for a viewport in CSS pixels. An empty viewport gets the minimum at scale 1. */
export function fitDesktop(viewport: Size): DesktopFit {
  if (!(viewport.width > 0 && viewport.height > 0)) return { scale: 1, size: { ...MIN_DESKTOP_SIZE } };
  const scale = Math.min(viewport.width / MIN_DESKTOP_SIZE.width, viewport.height / MIN_DESKTOP_SIZE.height);
  return {
    scale,
    size: {
      width: Math.max(MIN_DESKTOP_SIZE.width, Math.floor(viewport.width / scale)),
      height: Math.max(MIN_DESKTOP_SIZE.height, Math.floor(viewport.height / scale)),
    },
  };
}

/** A rectangle in desktop units as CSS pixels. */
export function toPixels(rect: Rect, scale: number): Rect {
  return { x: rect.x * scale, y: rect.y * scale, width: rect.width * scale, height: rect.height * scale };
}

/**
 * How big each app's window opens, in the band's smallest targets. A window then holds its
 * controls at their real size on any screen: a notepad is ten targets wide whether a target is
 * 44 or 72 pixels.
 */
const COMFORT_IN_TARGETS: Readonly<Record<AppKind, Size>> = {
  notepad: { width: 10, height: 7 },
  'picture-viewer': { width: 10, height: 8 },
  'file-explorer': { width: 13, height: 9 },
  'music-box': { width: 9.5, height: 8.5 },
  calculator: { width: 5.5, height: 8.6 },
  settings: { width: 11, height: 10 },
};

/** Room left around a new window, in desktop units, so it never opens over the desktop's edge. */
const OPEN_MARGIN: Size = { width: 96, height: 64 };

/**
 * The size, in desktop units, a new window of this app opens at: comfortable for a target of
 * `targetPx` CSS pixels at this scale, and never bigger than the desktop leaves room for.
 */
export function comfortableSize(app: AppKind, targetPx: number, fit: DesktopFit): Size {
  const comfort = COMFORT_IN_TARGETS[app];
  return {
    width: Math.round(Math.min((comfort.width * targetPx) / fit.scale, fit.size.width - OPEN_MARGIN.width)),
    height: Math.round(Math.min((comfort.height * targetPx) / fit.scale, fit.size.height - OPEN_MARGIN.height)),
  };
}
