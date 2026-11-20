import { PAPER } from '../../../core/paint/document.ts';
import { cloneSurface, type Surface } from '../../../core/paint/surface.ts';

/**
 * Above this mask opacity reversing the alpha blend amplifies 8-bit quantization noise, so the
 * pixel is filled from its nearest recovered neighbors (falling back to paper).
 */
const HIDDEN_ALPHA = 220;

/**
 * The paint layer of a saved coloring page. A gallery picture is saved flattened, the way a child
 * sees it, so other screens can show it. Reopening it puts the page's lines back as the mask, and
 * this takes the lines back out of the paint so they are not drawn twice. Under a see-through
 * line edge the paint is recovered by reversing the blend. Under a solid line it inherits its
 * nearest recovered neighbor color (preventing white fringes under antialiased edges), or paper
 * when no recovered neighbor is adjacent.
 */
export function unflattenUnderMask(flat: Surface, mask: Surface): Surface {
  if (flat.width !== mask.width || flat.height !== mask.height) {
    throw new RangeError(
      `The picture is ${flat.width} by ${flat.height}, but the mask is ${mask.width} by ${mask.height}.`,
    );
  }
  const { width, height } = flat;
  const result = cloneSurface(flat);
  const out = result.data;
  const lines = mask.data;
  const hidden = new Uint8Array(width * height);
  let hiddenCount = 0;

  for (let p = 0, i = 0; p < hidden.length; p++, i += 4) {
    const alpha = lines[i + 3] ?? 0;
    if (alpha === 0) continue;
    if (alpha >= HIDDEN_ALPHA) {
      hidden[p] = 1;
      hiddenCount += 1;
      out[i] = PAPER.r;
      out[i + 1] = PAPER.g;
      out[i + 2] = PAPER.b;
      out[i + 3] = 255;
      continue;
    }
    const keep = 255 - alpha;
    for (let c = 0; c < 3; c++) {
      out[i + c] = Math.round(((out[i + c] ?? 0) * 255 - (lines[i + c] ?? 0) * alpha) / keep);
    }
    out[i + 3] = 255;
  }

  // Dilate recovered paint 1 pixel into solid-mask borders so reopened coloring pages do not show
  // a white fringe under the antialiased edge of the line art.
  if (hiddenCount > 0) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (hidden[p] !== 1) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const np = ny * width + nx;
            if (hidden[np] === 1) continue;
            const ni = np * 4;
            r += out[ni] ?? 0;
            g += out[ni + 1] ?? 0;
            b += out[ni + 2] ?? 0;
            count += 1;
          }
        }
        if (count > 0) {
          const i = p * 4;
          out[i] = Math.round(r / count);
          out[i + 1] = Math.round(g / count);
          out[i + 2] = Math.round(b / count);
          out[i + 3] = 255;
        }
      }
    }
  }

  return result;
}
