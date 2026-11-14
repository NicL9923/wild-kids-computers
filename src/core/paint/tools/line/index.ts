import { Path } from '../../path.ts';
import { drawPath, previewStroke } from '../../preview.ts';
import { strokePolyline } from '../../raster.ts';
import { defineTool } from '../../types.ts';

/** A straight line with round ends, from where the stroke began to where it is now. */
export default defineTool({
  id: 'line',
  order: 3,
  stroke: (ctx) =>
    previewStroke(ctx, (from, to) => {
      const path = strokePolyline(new Path(), [from.x, from.y, to.x, to.y], ctx.settings.size, false);
      return drawPath(ctx, path, ctx.settings.color);
    }),
});
