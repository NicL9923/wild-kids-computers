import { drawStroke, previewStroke } from '../../preview.ts';
import { defineTool } from '../../types.ts';

/** A straight line with round ends, from where the stroke began to where it is now. */
export default defineTool({
  id: 'line',
  order: 3,
  stroke: (ctx) =>
    previewStroke(ctx, (from, to) =>
      drawStroke(ctx, [[from.x, from.y, to.x, to.y]], ctx.settings.size, false, ctx.settings.color),
    ),
});
