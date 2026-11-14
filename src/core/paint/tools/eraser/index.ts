import { tipStroke } from '../../dab.ts';
import { PAPER } from '../../document.ts';
import round from '../../tips/round.ts';
import { defineTool } from '../../types.ts';

/** Paints the paper color back with a round tip. The line art of a coloring page stays, because it is a separate layer. */
export default defineTool({
  id: 'eraser',
  order: 2,
  stroke: (ctx) => tipStroke({ ...ctx, settings: { ...ctx.settings, color: PAPER } }, round),
});
