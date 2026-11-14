import type { Color } from '../../core/paint/color.ts';
import { DOCUMENT_HEIGHT, DOCUMENT_WIDTH, createDocument } from '../../core/paint/document.ts';
import { History } from '../../core/paint/history.ts';
import { startStroke } from '../../core/paint/session.ts';
import type { Surface } from '../../core/paint/surface.ts';
import round from '../../core/paint/tips/round.ts';
import line from '../../core/paint/tools/line/index.ts';
import { PAINT_STUDIO_PATH } from './paths.ts';

/**
 * Opening the paint studio with a starting picture, for other features. The robot painter sends
 * its drawing as lines; anything else can send pixels. See README.md in this directory.
 *
 * ```ts
 * navigate({ to: openPaintStudioWith({ kind: 'lines', ...toPaintPicture(segments, canvas) }) });
 * ```
 */

interface StartingPoint {
  readonly x: number;
  readonly y: number;
}

/** One straight line, in the coordinates of the picture's own width and height. */
interface StartingLine {
  readonly from: StartingPoint;
  readonly to: StartingPoint;
  readonly color: Color;
  /** Stroke width in the same units as the coordinates. */
  readonly width: number;
}

export type StartingPicture =
  /** Straight RGBA pixels, row by row, any size up to 16384 on a side. Fitted onto the paper. */
  | { readonly kind: 'pixels'; readonly width: number; readonly height: number; readonly data: Uint8ClampedArray }
  /** Lines on a width by height drawing, scaled evenly to fit the paper and painted with the line tool. */
  | {
      readonly kind: 'lines';
      readonly width: number;
      readonly height: number;
      readonly lines: readonly StartingLine[];
    };

let pending: StartingPicture | null = null;

function checkSize(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`A starting picture needs a whole-number size of at least 1 by 1, got ${width} by ${height}.`);
  }
}

const finite = (point: StartingPoint): boolean => Number.isFinite(point.x) && Number.isFinite(point.y);

/** Throws a RangeError that names the problem when a starting picture cannot be painted. */
export function checkStartingPicture(picture: StartingPicture): void {
  checkSize(picture.width, picture.height);
  if (picture.kind === 'pixels') {
    const expected = picture.width * picture.height * 4;
    if (picture.data.length !== expected) {
      throw new RangeError(
        `A ${picture.width} by ${picture.height} picture has ${expected} bytes, got ${picture.data.length}.`,
      );
    }
    return;
  }
  picture.lines.forEach((item, i) => {
    if (!finite(item.from) || !finite(item.to)) throw new RangeError(`Line ${i} has a point that is not a number.`);
    if (!(item.width > 0) || !Number.isFinite(item.width)) throw new RangeError(`Line ${i} needs a width above 0.`);
  });
}

/**
 * Keeps the picture for the studio and returns the path to open. Navigate there right after: the
 * studio takes the picture when it opens, saves the picture it had, and starts a new one.
 */
export function openPaintStudioWith(picture: StartingPicture): string {
  checkStartingPicture(picture);
  pending = picture;
  return PAINT_STUDIO_PATH;
}

/** The picture waiting for the studio, if any. The studio clears it once the picture is open. */
export function peekStartingPicture(): StartingPicture | null {
  return pending;
}

/** Forgets the waiting picture, if it is still this one. A newer picture stays. */
export function clearStartingPicture(picture: StartingPicture): void {
  if (pending === picture) pending = null;
}

/**
 * Paints lines onto blank paper with the engine's line tool, scaled evenly from the picture's own
 * size to fit the document and centered.
 */
export function paintLines(picture: Extract<StartingPicture, { kind: 'lines' }>): Surface {
  const doc = createDocument(DOCUMENT_WIDTH, DOCUMENT_HEIGHT);
  const history = new History(doc, { maxSteps: 1 });
  const scale = Math.min(DOCUMENT_WIDTH / picture.width, DOCUMENT_HEIGHT / picture.height);
  const left = (DOCUMENT_WIDTH - picture.width * scale) / 2;
  const top = (DOCUMENT_HEIGHT - picture.height * scale) / 2;
  const at = (point: StartingPoint) => ({ x: left + point.x * scale, y: top + point.y * scale });
  for (const item of picture.lines) {
    const stroke = startStroke(history, line, { color: item.color, size: item.width * scale, tip: round, seed: 0 });
    stroke.begin(at(item.from));
    stroke.move(at(item.to));
    stroke.end();
  }
  return doc.paint;
}
