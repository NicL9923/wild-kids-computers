import { builtMapEffect } from '../../sampleMap.ts';
import { defineEffect } from '../../types.ts';

/** Turns the whole picture upside down, so the sky is at the bottom. */
export default defineEffect(
  builtMapEffect('flipUpsideDown', 3, (width, height) => {
    const map = new Int32Array(width * height);
    for (let y = 0, p = 0; y < height; y++) {
      const row = (height - 1 - y) * width;
      for (let x = 0; x < width; x++, p++) map[p] = row + x;
    }
    return map;
  }),
);
