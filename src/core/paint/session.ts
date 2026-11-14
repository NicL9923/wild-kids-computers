import type { History } from './history.ts';
import { unionRect, type Rect } from './rect.ts';
import { cloneSurface } from './surface.ts';
import type { PictureEffect, StrokeContext, ToolSettings, ToolStroke } from './types.ts';

/** Anything that paints with strokes: a tool or a stroke effect. */
export interface StrokePainter {
  stroke(ctx: StrokeContext): ToolStroke;
}

/**
 * Starts one stroke as one undo step. end commits the step and cancel discards it, so the
 * studio cannot forget either. This is the entry point the studio uses for every tool.
 */
export function startStroke(history: History, painter: StrokePainter, settings: ToolSettings): ToolStroke {
  const change = history.begin();
  const stroke = painter.stroke({ doc: history.doc, change, settings });
  let finished = false;
  const assertOpen = (): void => {
    if (finished) throw new Error('This stroke has already ended.');
  };
  return {
    begin(at) {
      assertOpen();
      return stroke.begin(at);
    },
    move(to) {
      assertOpen();
      return stroke.move(to);
    },
    end() {
      assertOpen();
      finished = true;
      const changed = stroke.end();
      history.commit(change);
      return changed;
    },
    cancel() {
      assertOpen();
      finished = true;
      const changed = stroke.cancel();
      return unionRect(changed, history.discard(change));
    },
  };
}

/**
 * Runs a whole-picture effect on the main thread as one undo step. The studio runs the same
 * apply in a worker instead and hands the result to history.replacePaint.
 */
export function applyPictureEffect(history: History, effect: PictureEffect): Rect {
  const doc = history.doc;
  const source = cloneSurface(doc.paint);
  const target = cloneSurface(doc.paint);
  effect.apply(source, target);
  return history.replacePaint(target.data);
}
