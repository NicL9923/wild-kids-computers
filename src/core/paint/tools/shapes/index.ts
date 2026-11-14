import { drawPath, drawStroke, previewStroke } from '../../preview.ts';
import { defineTool, type ShapeSettings } from '../../types.ts';
import { shapePath } from './shapePaths.ts';

const DEFAULT_SHAPE: ShapeSettings = { kind: 'rectangle', style: 'filled' };

/** A shape stretched between where the stroke began and where it is now, filled or outlined. */
export default defineTool({
  id: 'shapes',
  order: 4,
  stroke: (ctx) =>
    previewStroke(ctx, (from, to) => {
      const shape = ctx.settings.shape ?? DEFAULT_SHAPE;
      const box = {
        x0: Math.min(from.x, to.x),
        y0: Math.min(from.y, to.y),
        x1: Math.max(from.x, to.x),
        y1: Math.max(from.y, to.y),
      };
      const outline = shapePath(shape.kind, box);
      if (shape.style === 'filled') return drawPath(ctx, outline, ctx.settings.color);
      return drawStroke(ctx, outline.contours, ctx.settings.size, true, ctx.settings.color);
    }),
});
