import { describe, expect, it } from 'vitest';
import {
  cascadeRect,
  CASCADE_STEP,
  clampDesktopSize,
  clampWindowRect,
  MIN_DESKTOP_SIZE,
  MIN_VISIBLE_TITLE_BAR,
  MIN_WINDOW_SIZE,
  TITLE_BAR_HEIGHT,
  visibleFraction,
  type Rect,
  type Size,
} from './geometry.ts';

/** The rule the brief states: the title bar is never fully outside the desktop. */
function titleBarReachable(rect: Rect, desktop: Size): boolean {
  const visibleWidth = Math.min(rect.x + rect.width, desktop.width) - Math.max(rect.x, 0);
  return visibleWidth >= MIN_VISIBLE_TITLE_BAR && rect.y >= 0 && rect.y + TITLE_BAR_HEIGHT <= desktop.height;
}

describe('clampDesktopSize', () => {
  it('raises a size below 1024 by 640 to the minimum and rounds', () => {
    expect(clampDesktopSize({ width: 800, height: 900.4 })).toEqual({ width: MIN_DESKTOP_SIZE.width, height: 900 });
    expect(clampDesktopSize({ width: 1500, height: 300 })).toEqual({ width: 1500, height: MIN_DESKTOP_SIZE.height });
  });
});

describe('clampWindowRect', () => {
  const desktops: Size[] = [MIN_DESKTOP_SIZE, { width: 1280, height: 800 }, { width: 2560, height: 1440 }];
  const wild: Rect[] = [
    { x: -5000, y: -5000, width: 600, height: 400 },
    { x: 5000, y: 5000, width: 600, height: 400 },
    { x: -590, y: 100, width: 600, height: 400 },
    { x: 100, y: 10_000, width: 10, height: 10 },
    { x: 0, y: 0, width: 99_999, height: 99_999 },
  ];

  it.each(desktops.flatMap((desktop) => wild.map((rect) => [desktop, rect] as const)))(
    'keeps the title bar reachable on %o for %o',
    (desktop, rect) => {
      const clamped = clampWindowRect(rect, desktop);
      expect(titleBarReachable(clamped, desktop)).toBe(true);
      expect(clamped.width).toBeGreaterThanOrEqual(MIN_WINDOW_SIZE.width);
      expect(clamped.width).toBeLessThanOrEqual(desktop.width);
      expect(clamped.height).toBeLessThanOrEqual(desktop.height);
    },
  );

  it('leaves a window that is already reachable where it is', () => {
    const rect = { x: 100, y: 50, width: 500, height: 300 };
    expect(clampWindowRect(rect, MIN_DESKTOP_SIZE)).toEqual(rect);
  });

  it('allows a window to hang off the side down to the grab width, on both sides', () => {
    const desktop = MIN_DESKTOP_SIZE;
    const left = clampWindowRect({ x: -10_000, y: 0, width: 500, height: 300 }, desktop);
    const right = clampWindowRect({ x: 10_000, y: 0, width: 500, height: 300 }, desktop);
    expect(left.x).toBe(MIN_VISIBLE_TITLE_BAR - 500);
    expect(right.x).toBe(desktop.width - MIN_VISIBLE_TITLE_BAR);
  });

  it('keeps the whole title bar on screen from top to bottom', () => {
    const desktop = MIN_DESKTOP_SIZE;
    expect(clampWindowRect({ x: 0, y: -1, width: 500, height: 300 }, desktop).y).toBe(0);
    expect(clampWindowRect({ x: 0, y: 10_000, width: 500, height: 300 }, desktop).y).toBe(
      desktop.height - TITLE_BAR_HEIGHT,
    );
  });
});

describe('visibleFraction', () => {
  const desktop = { width: 1000, height: 1000 };
  it.each([
    ['inside', { x: 0, y: 0, width: 100, height: 100 }, 1],
    ['half off the left', { x: -50, y: 0, width: 100, height: 100 }, 0.5],
    ['a quarter on, at the bottom right corner', { x: 950, y: 950, width: 100, height: 100 }, 0.25],
    ['fully off', { x: 2000, y: 0, width: 100, height: 100 }, 0],
    ['touching the edge from outside', { x: -100, y: 0, width: 100, height: 100 }, 0],
    ['off past the top left corner', { x: -300, y: -300, width: 100, height: 100 }, 0],
  ])('is right for a window %s', (_label, rect, fraction) => {
    expect(visibleFraction(rect, desktop)).toBe(fraction);
  });
});

describe('cascadeRect', () => {
  const desktop = { width: 1280, height: 800 };
  const size = { width: 560, height: 400 };

  it('steps each new window down and right from the last', () => {
    const first = cascadeRect(size, desktop, []);
    const second = cascadeRect(size, desktop, [first]);
    const third = cascadeRect(size, desktop, [first, second]);
    expect(second.x - first.x).toBe(CASCADE_STEP);
    expect(second.y - first.y).toBe(CASCADE_STEP);
    expect(third.x - second.x).toBe(CASCADE_STEP);
  });

  it('reuses a free place left by a closed window', () => {
    const first = cascadeRect(size, desktop, []);
    const second = cascadeRect(size, desktop, [first]);
    expect(cascadeRect(size, desktop, [second])).toEqual(first);
  });

  it('starts over at the top left instead of pushing a window off the desktop', () => {
    const taken: Rect[] = [];
    for (let index = 0; index < 30; index += 1) taken.push(cascadeRect(size, desktop, taken));
    for (const rect of taken) {
      expect(rect.x + rect.width).toBeLessThanOrEqual(desktop.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(desktop.height);
    }
    expect(new Set(taken.map((rect) => rect.x)).size).toBeGreaterThan(1);
  });

  it('opens a window bigger than the desktop at the desktop size', () => {
    const rect = cascadeRect({ width: 5000, height: 5000 }, MIN_DESKTOP_SIZE, []);
    expect(rect.width).toBe(MIN_DESKTOP_SIZE.width);
    expect(rect.height).toBe(MIN_DESKTOP_SIZE.height);
    expect(titleBarReachable(rect, MIN_DESKTOP_SIZE)).toBe(true);
  });
});

describe('cascadeRect places', () => {
  const desktop = { width: 1280, height: 800 };

  it('does not count a window with the same left edge but another top as taken', () => {
    const size = { width: 560, height: 400 };
    const first = cascadeRect(size, desktop, []);
    expect(cascadeRect(size, desktop, [{ ...first, y: first.y + 200 }])).toEqual(first);
  });

  it.each([
    ['a wide window, limited by the width', { width: 1000, height: 300 }],
    ['a tall window, limited by the height', { width: 400, height: 600 }],
  ])('uses every place that fits for %s', (_label, size) => {
    const taken: Rect[] = [];
    for (let index = 0; index < 40; index += 1) taken.push(cascadeRect(size, desktop, taken));
    const right = Math.max(...taken.map((rect) => rect.x + rect.width));
    const bottom = Math.max(...taken.map((rect) => rect.y + rect.height));
    // The last place leaves less than one step of room on the limiting side.
    expect(Math.max(desktop.width - right, 0) < CASCADE_STEP || desktop.height - bottom < CASCADE_STEP).toBe(true);
    expect(right).toBeLessThanOrEqual(desktop.width);
    expect(bottom).toBeLessThanOrEqual(desktop.height);
  });
});
