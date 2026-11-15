import { describe, expect, it } from 'vitest';
import { fitZoomFactor, keepPageFitted, type FittableWindow } from './windowFit.ts';

describe('fitZoomFactor', () => {
  it.each([
    ['the smallest supported window', 1024, 640, 1],
    ['a large window', 1920, 1080, 1],
    ['a tile one pixel too narrow', 1023, 900, 1023 / 1024],
    ['a tile one pixel too short', 1600, 639, 639 / 640],
    ['half of a 1080p screen', 960, 1080, 960 / 1024],
    ['a short wide tile', 1900, 520, 520 / 640],
    ['a small window, limited by its width', 640, 480, 640 / 1024],
  ])('gives %s (%i by %i) the factor %d', (_label, width, height, factor) => {
    expect(fitZoomFactor({ width, height })).toBeCloseTo(factor, 10);
  });

  it.each([
    [0, 600],
    [800, 0],
    [Number.NaN, 600],
  ])('leaves the zoom at 1 for a window with no area (%d by %d)', (width, height) => {
    expect(fitZoomFactor({ width, height })).toBe(1);
  });
});

function fakeWindow(size: number[]) {
  const listeners = new Map<string, () => void>();
  const zooms: number[] = [];
  const state = { size, destroyed: false };
  const window: FittableWindow = {
    on: (event, listener) => listeners.set(event, listener),
    getContentSize: () => state.size,
    isDestroyed: () => state.destroyed,
    webContents: {
      on: (event, listener) => listeners.set(event, listener),
      setZoomFactor: (factor) => zooms.push(factor),
    },
  };
  return { window, zooms, state, fire: (event: string) => listeners.get(event)?.() };
}

describe('keepPageFitted', () => {
  it('fits at once, after a resize, and after each page load, and reports each factor', () => {
    const { window, zooms, state, fire } = fakeWindow([1280, 800]);
    const reported: number[] = [];
    keepPageFitted(window, (factor) => reported.push(factor));
    state.size = [512, 800];
    fire('resize');
    fire('did-finish-load');
    expect(zooms).toEqual([1, 0.5, 0.5]);
    expect(reported).toEqual(zooms);
  });

  it('leaves a destroyed window alone', () => {
    const { window, zooms, state, fire } = fakeWindow([1280, 800]);
    keepPageFitted(window, () => undefined);
    state.destroyed = true;
    fire('resize');
    expect(zooms).toEqual([1]);
  });
});
