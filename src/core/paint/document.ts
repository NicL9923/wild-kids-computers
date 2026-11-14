import { blendPixel, WHITE, type Color } from './color.ts';
import { cloneSurface, createSurface, type Surface } from './surface.ts';

/** The studio's canvas size. The engine takes any size, so tests use smaller documents. */
export const DOCUMENT_WIDTH = 1600;
export const DOCUMENT_HEIGHT = 1000;

/** The paper color. A new document starts with it and the eraser paints it. */
export const PAPER: Color = WHITE;

/**
 * A picture: an opaque paint layer and an optional line-art mask.
 *
 * The mask holds the lines of a coloring page. It sits above the paint, the fill tool treats
 * its solid pixels as walls, and no tool paints on it. Only history steps replace it, so a
 * mask surface is never changed in place and a history step can keep a reference to it.
 */
export interface PaintDocument {
  readonly width: number;
  readonly height: number;
  readonly paint: Surface;
  mask: Surface | null;
}

/** Mask pixels at least this opaque are walls for the fill tool. */
export const MASK_WALL_ALPHA = 128;

export function createDocument(width = DOCUMENT_WIDTH, height = DOCUMENT_HEIGHT): PaintDocument {
  return { width, height, paint: createSurface(width, height, PAPER), mask: null };
}

/** The picture as a person sees it: the paint with the mask drawn over it. For saving and thumbnails. */
export function flattenDocument(doc: PaintDocument): Surface {
  const result = cloneSurface(doc.paint);
  const mask = doc.mask;
  if (mask === null) return result;
  const source = mask.data;
  const target = result.data;
  for (let i = 0; i < source.length; i += 4) {
    blendPixel(target, i, source[i] ?? 0, source[i + 1] ?? 0, source[i + 2] ?? 0, source[i + 3] ?? 0);
  }
  return result;
}
