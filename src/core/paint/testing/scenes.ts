import { rgba, type Color } from '../color.ts';
import type { PaintDocument } from '../document.ts';
import { Path } from '../path.ts';
import { fillPath } from '../raster.ts';
import { applyPictureEffect } from '../session.ts';
import type { Surface } from '../surface.ts';
import type { PictureEffect, StrokeContext, ToolStroke } from '../types.ts';
import { drawStroke, newPicture, testSettings, wave } from './golden.ts';

/**
 * Test pictures for effect goldens. Test-only, like golden.ts.
 *
 * The scene is lopsided on purpose: the sun is top left and the house stands right of the
 * middle, so a flip, fold, or wheel shows at a glance which way the picture moved.
 */
export function paintScene(doc: PaintDocument): void {
  const w = doc.width / 200;
  const h = doc.height / 125;
  const shape = (points: number[]): Path => new Path().polygon(points.map((value, i) => value * (i % 2 === 0 ? w : h)));
  fillPath(doc.paint, shape([0, 0, 200, 0, 200, 125, 0, 125]), rgba(200, 230, 250));
  fillPath(doc.paint, new Path().ellipse(34 * w, 28 * h, 17 * w, 17 * h), rgba(250, 195, 30));
  fillPath(doc.paint, new Path().ellipse(60 * w, 128 * h, 125 * w, 75 * h), rgba(90, 180, 70));
  fillPath(doc.paint, shape([112, 62, 162, 62, 162, 104, 112, 104]), rgba(220, 60, 50));
  fillPath(doc.paint, shape([104, 64, 137, 34, 170, 64]), rgba(110, 60, 140));
  fillPath(doc.paint, shape([130, 80, 144, 80, 144, 104, 130, 104]), rgba(40, 90, 220));
  fillPath(doc.paint, shape([117, 70, 126, 70, 126, 78, 117, 78]), rgba(255, 245, 190));
}

/** A fresh copy of the scene's pixels. */
export function scenePicture(): Surface {
  const { doc } = newPicture();
  paintScene(doc);
  return doc.paint;
}

/** Whether a picture reads the same from the left as from the right, and from the top as from the bottom. */
export function isSymmetric(picture: Surface): { sideways: boolean; upDown: boolean } {
  const { width, height, data } = picture;
  let sideways = true;
  let upDown = true;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 4; c++) {
        const here = data[(y * width + x) * 4 + c];
        if (here !== data[(y * width + (width - 1 - x)) * 4 + c]) sideways = false;
        if (here !== data[((height - 1 - y) * width + x) * 4 + c]) upDown = false;
      }
    }
  }
  return { sideways, upDown };
}

/** Square checks of two colors, the clearest picture for an effect that bends space. */
export function paintChecks(doc: PaintDocument, check = 10): void {
  for (let y = 0; y < doc.height; y += check) {
    for (let x = (y / check) % 2 === 0 ? 0 : check; x < doc.width; x += 2 * check) {
      fillPath(
        doc.paint,
        new Path().polygon([x, y, x + check, y, x + check, y + check, x, y + check]),
        rgba(30, 150, 160),
      );
    }
  }
}

/** The scene, or another picture, with a whole-picture effect applied, for its golden. */
export function sceneWith(effect: PictureEffect, paint: (doc: PaintDocument) => void = paintScene): PaintDocument {
  const { doc, history } = newPicture();
  paint(doc);
  applyPictureEffect(history, effect);
  return doc;
}

interface StrokeEffectLike {
  stroke(ctx: StrokeContext): ToolStroke;
}

/** A wave painted with a paint-on effect, on white paper or a background color, for its golden. */
export function waveWith(
  effect: StrokeEffectLike,
  options: { seed?: number; size?: number; background?: Color } = {},
): PaintDocument {
  const { doc, history } = newPicture();
  if (options.background !== undefined) {
    fillPath(
      doc.paint,
      new Path().polygon([0, 0, doc.width, 0, doc.width, doc.height, 0, doc.height]),
      options.background,
    );
  }
  drawStroke(history, effect, testSettings({ size: options.size ?? 40, seed: options.seed ?? 7 }), wave());
  return doc;
}
