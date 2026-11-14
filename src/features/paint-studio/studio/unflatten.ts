import { PAPER } from '../../../core/paint/document.ts';
import { cloneSurface, type Surface } from '../../../core/paint/surface.ts';

/** Above this mask opacity the paint underneath cannot be recovered, and nobody can see it. */
const HIDDEN_ALPHA = 250;

/**
 * The paint layer of a saved coloring page. A gallery picture is saved flattened, the way a child
 * sees it, so other screens can show it. Reopening it puts the page's lines back as the mask, and
 * this takes the lines back out of the paint so they are not drawn twice. Under a see-through
 * line edge the paint is recovered by reversing the blend. Under a solid line it is paper.
 */
export function unflattenUnderMask(flat: Surface, mask: Surface): Surface {
  if (flat.width !== mask.width || flat.height !== mask.height) {
    throw new RangeError(
      `The picture is ${flat.width} by ${flat.height}, but the mask is ${mask.width} by ${mask.height}.`,
    );
  }
  const result = cloneSurface(flat);
  const out = result.data;
  const lines = mask.data;
  for (let i = 0; i < out.length; i += 4) {
    const alpha = lines[i + 3] ?? 0;
    if (alpha === 0) continue;
    if (alpha >= HIDDEN_ALPHA) {
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
  return result;
}
