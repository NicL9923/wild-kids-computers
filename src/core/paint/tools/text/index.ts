import { textPath } from '../../glyphs.ts';
import { drawPath, previewStroke } from '../../preview.ts';
import { EMPTY_RECT } from '../../rect.ts';
import { defineTool } from '../../types.ts';

/**
 * Places text. The text starts at the pointer, with the middle of its capitals level with it,
 * and follows the pointer until the stroke ends. The tool size is the height of a capital.
 */
export default defineTool({
  id: 'text',
  order: 6,
  stroke: (ctx) =>
    previewStroke(ctx, (_from, at) => {
      const text = ctx.settings.text;
      if (text === undefined || text.content === '') return EMPTY_RECT;
      const { size } = ctx.settings;
      return drawPath(ctx, textPath(text.font, text.content, size, at.x, at.y - size / 2), ctx.settings.color);
    }),
});
