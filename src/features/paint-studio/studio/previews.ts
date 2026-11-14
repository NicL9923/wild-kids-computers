import { rgba, type Color } from '../../../core/paint/color.ts';
import { createDocument, flattenDocument } from '../../../core/paint/document.ts';
import { History } from '../../../core/paint/history.ts';
import { sin, TAU } from '../../../core/paint/math.ts';
import { startStroke, type StrokePainter } from '../../../core/paint/session.ts';
import { cloneSurface, type Surface } from '../../../core/paint/surface.ts';
import { thumbnail } from '../../../core/paint/thumbnail.ts';
import round from '../../../core/paint/tips/round.ts';
import brush from '../../../core/paint/tools/brush/index.ts';
import fill from '../../../core/paint/tools/fill/index.ts';
import shapes from '../../../core/paint/tools/shapes/index.ts';
import type {
  BrushTip,
  FillStyle,
  PaintEffect,
  ShapeKind,
  ToolPoint,
  ToolSettings,
} from '../../../core/paint/types.ts';
import type { PaintDocument } from '../../../core/paint/document.ts';

/**
 * Small pictures for the pickers, painted by the real engine, so a child sees what a tip, shape,
 * fill, or effect does instead of reading its name. Each is a pure function of its inputs.
 */

const PREVIEW_SEED = 7;

function paintOnce(
  doc: PaintDocument,
  painter: StrokePainter,
  settings: ToolSettings,
  points: readonly ToolPoint[],
): void {
  const history = new History(doc, { maxSteps: 1 });
  const [first, ...rest] = points;
  if (first === undefined) return;
  const stroke = startStroke(history, painter, settings);
  stroke.begin(first);
  for (const point of rest) stroke.move(point);
  stroke.end();
}

/** A gentle wave across a width by height box, inset by margin. */
function wave(width: number, height: number, margin: number): ToolPoint[] {
  const points: ToolPoint[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({ x: margin + t * (width - 2 * margin), y: height / 2 + sin(t * TAU) * (height / 2 - margin) * 0.7 });
  }
  return points;
}

/** A brush tip painting a wave in the chosen color. The brush tool paints with the tip the settings carry. */
export function tipPreview(tip: BrushTip, color: Color, width = 96, height = 48): Surface {
  const doc = createDocument(width, height);
  const size = Math.round(height * 0.3);
  paintOnce(doc, brush, base(color, size, tip), wave(width, height, size));
  return doc.paint;
}

function base(color: Color, size: number, tip: BrushTip = round): ToolSettings {
  return { color, size, tip, seed: PREVIEW_SEED };
}

/** A shape filled or outlined in the chosen color. */
export function shapePreview(kind: ShapeKind, style: 'filled' | 'outline', color: Color, side = 56): Surface {
  const doc = createDocument(side, side);
  const inset = Math.round(side * 0.12);
  paintOnce(doc, shapes, { ...base(color, Math.max(3, Math.round(side / 12))), shape: { kind, style } }, [
    { x: inset, y: inset },
    { x: side - inset, y: side - inset },
  ]);
  return doc.paint;
}

/** A fill style poured into a framed box. */
export function fillPreview(style: FillStyle, color: Color, width = 72, height = 48): Surface {
  const doc = createDocument(width, height);
  // A thin frame, so the preview shows a filled shape, not a filled tile.
  const frame = createDocument(width, height).paint;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edge = x < 2 || y < 2 || x >= width - 2 || y >= height - 2;
      frame.data.set(edge ? [70, 70, 70, 255] : [0, 0, 0, 0], (y * width + x) * 4);
    }
  }
  doc.mask = frame;
  paintOnce(doc, fill, { ...base(color, 1), fill: style }, [{ x: width / 2, y: height / 2 }]);
  return flattenDocument(doc);
}

/** A bright little scene, so an effect shows what it does even on blank paper. */
export function sampleScene(width: number, height: number): Surface {
  const doc = createDocument(width, height);
  const data = doc.paint.data;
  const sky = rgba(120, 200, 240);
  const grass = rgba(70, 170, 80);
  const sun = rgba(250, 204, 21);
  const flower = rgba(220, 38, 38);
  const discs = [
    { x: 0.27, y: 0.32, r: 0.2, color: sun },
    { x: 0.7, y: 0.66, r: 0.13, color: flower },
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const hill = y > height * (0.62 - 0.12 * sin((x / width) * TAU * 0.5));
      let color = hill ? grass : sky;
      for (const disc of discs) {
        const dx = x - disc.x * width;
        const dy = y - disc.y * height;
        if (dx * dx + dy * dy <= disc.r * height * (disc.r * height)) color = disc.color;
      }
      data.set([color.r, color.g, color.b, 255], (y * width + x) * 4);
    }
  }
  return doc.paint;
}

/** Below this share of painted pixels, previews use the sample scene instead of the picture. */
const NEARLY_BLANK = 0.12;

/**
 * The starting point for effect previews: the child's own picture, small, once there is enough on
 * it to show an effect, and a sample scene before that.
 */
export function effectPreviewBase(picture: Surface, width = 128, height = 80): Surface {
  const small = thumbnail(picture, width, height);
  let painted = 0;
  for (let i = 0; i < small.data.length; i += 4) {
    if ((small.data[i] ?? 0) < 245 || (small.data[i + 1] ?? 0) < 245 || (small.data[i + 2] ?? 0) < 245) painted++;
  }
  return painted / (width * height) < NEARLY_BLANK ? sampleScene(width, height) : small;
}

/** What an effect does to the picture: the whole picture at once, or one stroke across it. */
export function effectPreview(effect: PaintEffect, source: Surface, color: Color = rgba(220, 38, 38)): Surface {
  if (effect.group === 'whole-picture') {
    const target = cloneSurface(source);
    effect.apply(cloneSurface(source), target);
    return target;
  }
  const doc = createDocument(source.width, source.height);
  doc.paint.data.set(source.data);
  const size = Math.round(source.height * 0.35);
  paintOnce(doc, effect, base(color, size), wave(source.width, source.height, Math.round(size / 2)));
  return doc.paint;
}
