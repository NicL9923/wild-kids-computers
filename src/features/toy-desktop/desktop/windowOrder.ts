import type { WindowState } from '../model/state.ts';

/** The number in a window id such as "w12". */
export function windowNumber(window: Pick<WindowState, 'id'>): number {
  return Number(window.id.slice(1));
}

/**
 * Orders windows by when they opened. The screen keeps windows in this order in the page, and
 * draws the one in front on top with a layer number, so bringing a window forward never moves
 * a focused text box in the page and loses its focus.
 */
export function byWindowNumber(a: WindowState, b: WindowState): number {
  return windowNumber(a) - windowNumber(b);
}
