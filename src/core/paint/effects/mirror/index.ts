import { sampleMapEffect } from '../../sampleMap.ts';
import { defineEffect } from '../../types.ts';

/** Reflects the left half of the picture onto the right half, like folding wet paint. */
export default defineEffect(
  sampleMapEffect('mirror', 1, (x, y, width) => (x < width / 2 ? -1 : y * width + (width - 1 - x))),
);
