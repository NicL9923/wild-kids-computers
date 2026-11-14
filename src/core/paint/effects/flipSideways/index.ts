import { builtMapEffect } from '../../sampleMap.ts';
import { defineEffect } from '../../types.ts';

/** Flips the whole picture left to right, as if seen in a mirror. */
export default defineEffect(
  builtMapEffect('flipSideways', 2, (width, height) => {
    const map = new Int32Array(width * height);
    for (let y = 0, p = 0; y < height; y++) {
      const row = y * width + width - 1;
      for (let x = 0; x < width; x++, p++) map[p] = row - x;
    }
    return map;
  }),
);
