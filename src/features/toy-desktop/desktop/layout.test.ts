import { describe, expect, it } from 'vitest';
import { MIN_DESKTOP_SIZE } from '../model/geometry.ts';
import { comfortableSize, contentZoom, fitDesktop, toPixels } from './layout.ts';

describe('fitDesktop', () => {
  it('gives the minimum desktop at scale 1 before the space is measured', () => {
    for (const viewport of [
      { width: 0, height: 0 },
      { width: 800, height: 0 },
      { width: Number.NaN, height: 500 },
    ]) {
      expect(fitDesktop(viewport)).toEqual({ scale: 1, size: MIN_DESKTOP_SIZE });
    }
  });

  it.each([
    ['a wide, short space', { width: 1200, height: 450 }, 'height'],
    ['a narrow, tall space', { width: 700, height: 600 }, 'width'],
    ['a big screen', { width: 1800, height: 820 }, 'height'],
  ] as const)('fits %s: the minimum fills one side and the desktop grows along the other', (_label, viewport, full) => {
    const { scale, size } = fitDesktop(viewport);
    expect(size[full]).toBe(MIN_DESKTOP_SIZE[full]);
    expect(size.width).toBeGreaterThanOrEqual(MIN_DESKTOP_SIZE.width);
    expect(size.height).toBeGreaterThanOrEqual(MIN_DESKTOP_SIZE.height);
    // Nothing is clipped: the scaled desktop fits the space, and leaves under a unit spare.
    expect(size.width * scale).toBeLessThanOrEqual(viewport.width);
    expect(size.height * scale).toBeLessThanOrEqual(viewport.height);
    expect(viewport.width - size.width * scale).toBeLessThan(scale);
    expect(viewport.height - size.height * scale).toBeLessThan(scale);
  });

  it('scales a rectangle to pixels', () => {
    expect(toPixels({ x: 10, y: 20, width: 100, height: 50 }, 0.5)).toEqual({ x: 5, y: 10, width: 50, height: 25 });
  });
});

describe('comfortableSize', () => {
  const fit = { scale: 0.5, size: { width: 2000, height: 1200 } };

  it('opens a window wide enough for its controls at the band target, in desktop units', () => {
    // A notepad is ten targets wide and seven tall: 10 * 56 px at half scale is 1120 units.
    expect(comfortableSize('notepad', 56, fit)).toEqual({ width: 1120, height: 784 });
    expect(comfortableSize('notepad', 72, fit).width).toBeGreaterThan(comfortableSize('notepad', 44, fit).width);
  });

  it('never opens a window bigger than the desktop leaves room for', () => {
    const tight = { scale: 0.5, size: { width: 1024, height: 640 } };
    expect(comfortableSize('file-explorer', 72, tight)).toEqual({ width: 1024 - 96, height: 640 - 64 });
  });
});

describe('contentZoom', () => {
  it.each([
    ['band-9-12', { width: 1280, height: 800 }, 1],
    ['band-9-12', { width: 1920, height: 1080 }, 1.35],
    ['band-9-12', { width: 3840, height: 2160 }, 1.5],
    ['band-9-12', { width: 1024, height: 640 }, 1],
    ['band-6-8', { width: 1920, height: 1080 }, 1],
    ['band-3-5', { width: 1920, height: 1080 }, 1],
  ] as const)('at %s in a %o window is %d', (band, window, zoom) => {
    expect(contentZoom(band, window)).toBeCloseTo(zoom, 5);
  });
});
