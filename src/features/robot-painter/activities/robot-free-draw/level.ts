import type { Band } from '../../../../core/bands.ts';
import { FREE_MODES, type FreeMode } from '../../engine/freeMode.ts';

/** Free play: the canvas, start, and blocks the engine gives each band. No goal. */
export function generateLevel(_seed: number, band: Band): FreeMode {
  return FREE_MODES[band];
}
