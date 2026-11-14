import { tipStroke } from '../../dab.ts';
import { defineTool } from '../../types.ts';

/** Paints with the chosen brush tip and color. */
export default defineTool({
  id: 'brush',
  order: 1,
  stroke: (ctx) => tipStroke(ctx, ctx.settings.tip),
});
