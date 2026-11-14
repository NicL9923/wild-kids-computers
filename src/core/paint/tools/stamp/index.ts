import { previewStroke } from '../../preview.ts';
import { EMPTY_RECT } from '../../rect.ts';
import type { Surface } from '../../surface.ts';
import { defineTool } from '../../types.ts';
import { placeStamp, sizedBitmap } from './placeStamp.ts';

/**
 * Places the chosen stamp centered on the pointer, resized so its longest side is the tool
 * size, flipped and rotated as chosen. It follows the pointer until the stroke ends.
 */
export default defineTool({
  id: 'stamp',
  order: 7,
  stroke: (ctx) => {
    const stamp = ctx.settings.stamp;
    let sized: { source: Surface; scale: number } | null = null;
    return previewStroke(ctx, (_from, at) => {
      if (stamp === undefined || ctx.settings.size <= 0) return EMPTY_RECT;
      sized ??= sizedBitmap(stamp.bitmap, ctx.settings.size);
      return placeStamp(ctx.doc.paint, sized.source, sized.scale, stamp, at.x, at.y, (rect) => ctx.change.touch(rect));
    });
  },
});
