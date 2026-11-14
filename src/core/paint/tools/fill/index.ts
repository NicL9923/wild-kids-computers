import { EMPTY_RECT } from '../../rect.ts';
import { defineTool, type FillStyle } from '../../types.ts';
import { floodFill } from './floodFill.ts';

const SOLID: FillStyle = { kind: 'solid' };

/** The fill bucket: paints the connected area under the click, inside the lines of a coloring page. */
export default defineTool({
  id: 'fill',
  order: 5,
  stroke: (ctx) => ({
    begin: (at) => floodFill(ctx.doc, ctx.change, at.x, at.y, ctx.settings.color, ctx.settings.fill ?? SOLID),
    move: () => EMPTY_RECT,
    end: () => EMPTY_RECT,
    cancel: () => ctx.change.revert(),
  }),
});
