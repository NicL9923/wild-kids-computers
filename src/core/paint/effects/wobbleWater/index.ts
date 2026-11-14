import { sin, TAU } from '../../math.ts';
import { builtMapEffect } from '../../sampleMap.ts';
import { defineEffect } from '../../types.ts';

/**
 * Makes the picture wobble as if it lay under rippling water. Each row slides sideways and each
 * column slides up or down along a gentle wave, one sine per row and per column. The waves scale
 * with the picture, so a small picture wobbles the same way a big one does.
 */
export default defineEffect(
  builtMapEffect('wobbleWater', 7, (width, height) => {
    const amplitude = Math.max(1, height * 0.022);
    const wavelength = Math.max(4, height * 0.16);
    const sideways = new Int32Array(height);
    for (let y = 0; y < height; y++) sideways[y] = Math.round(amplitude * sin((TAU * y) / wavelength));
    const upDown = new Int32Array(width);
    for (let x = 0; x < width; x++) upDown[x] = Math.round(amplitude * 0.6 * sin((TAU * x) / (wavelength * 1.4) + 1));
    const map = new Int32Array(width * height);
    for (let y = 0, p = 0; y < height; y++) {
      const shift = sideways[y] ?? 0;
      for (let x = 0; x < width; x++, p++) {
        const sx = Math.min(width - 1, Math.max(0, x + shift));
        const sy = Math.min(height - 1, Math.max(0, y + (upDown[x] ?? 0)));
        map[p] = sy * width + sx;
      }
    }
    return map;
  }),
);
