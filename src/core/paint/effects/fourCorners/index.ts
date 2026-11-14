import { builtMapEffect } from '../../sampleMap.ts';
import { defineEffect } from '../../types.ts';

/** Copies the top left quarter into all four corners, folded like a paper napkin. */
export default defineEffect(
  builtMapEffect('fourCorners', 4, (width, height) => {
    const map = new Int32Array(width * height);
    for (let y = 0, p = 0; y < height; y++) {
      const row = (y < height / 2 ? y : height - 1 - y) * width;
      for (let x = 0; x < width; x++, p++) map[p] = row + (x < width / 2 ? x : width - 1 - x);
    }
    return map;
  }),
);
