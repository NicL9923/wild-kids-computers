import type { Color } from './color.ts';
import type { Path } from './path.ts';
import { blendPixel, div255 } from './color.ts';
import { fillPath, pathRect, rasterizeStroke, strokeRect } from './raster.ts';
import { EMPTY_RECT, growRect, unionRect, type Rect } from './rect.ts';
import type { StrokeContext, ToolPoint, ToolStroke } from './types.ts';

/**
 * A stroke that draws one thing and redraws it as the pointer moves: a line, a shape, text, or
 * a stamp. Before each redraw it puts back the pixels the last drawing covered, from the
 * change's saved tiles, so nothing builds up.
 */
export function previewStroke(ctx: StrokeContext, draw: (anchor: ToolPoint, current: ToolPoint) => Rect): ToolStroke {
  let anchor: ToolPoint = { x: 0, y: 0 };
  let drawn = EMPTY_RECT;
  return {
    begin(at) {
      anchor = at;
      drawn = draw(anchor, at);
      return drawn;
    },
    move(to) {
      const restored = ctx.change.restore(drawn);
      drawn = draw(anchor, to);
      return unionRect(restored, drawn);
    },
    end() {
      return EMPTY_RECT;
    },
    cancel() {
      return ctx.change.revert();
    },
  };
}

/** Fills a path into the document, saving the tiles it covers first. */
export function drawPath(ctx: StrokeContext, path: Path, color: Color): Rect {
  const docRect = { x: 0, y: 0, width: ctx.doc.width, height: ctx.doc.height };
  ctx.change.touch(growRect(pathRect(path, docRect), 1));
  return fillPath(ctx.doc.paint, path, color);
}

/** Strokes polylines into the document with round ends and joins, saving the tiles first. */
export function drawStroke(
  ctx: StrokeContext,
  polylines: readonly (readonly number[])[],
  width: number,
  closed: boolean,
  color: Color,
): Rect {
  const { doc } = ctx;
  const docRect = { x: 0, y: 0, width: doc.width, height: doc.height };
  ctx.change.touch(strokeRect(polylines, width / 2, docRect));
  const data = doc.paint.data;
  return rasterizeStroke(polylines, width, closed, docRect, (x, y, coverage) => {
    blendPixel(data, (y * doc.width + x) * 4, color.r, color.g, color.b, div255(color.a * coverage));
  });
}
