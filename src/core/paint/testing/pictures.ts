import { hsv, type Color } from '../color.ts';
import type { PaintDocument } from '../document.ts';
import { BLUE, ORANGE } from './golden.ts';

/** Source pictures for effect goldens, chosen so an effect's change is obvious at a glance. */

/** A checkerboard, so moved pixels show as bent lines. */
export function paintChecks(doc: PaintDocument, cell = 12, a: Color = BLUE, b: Color = ORANGE): void {
  const data = doc.paint.data;
  for (let y = 0; y < doc.height; y++) {
    for (let x = 0; x < doc.width; x++) {
      const color = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? a : b;
      data.set([color.r, color.g, color.b, 255], (y * doc.width + x) * 4);
    }
  }
}

/** Every hue from left to right, from white at the top through full color to black at the bottom. */
export function paintSpectrum(doc: PaintDocument): void {
  const data = doc.paint.data;
  const half = doc.height / 2;
  for (let y = 0; y < doc.height; y++) {
    const saturation = Math.min(1, (y + 0.5) / half);
    const value = Math.min(1, (doc.height - y - 0.5) / half);
    for (let x = 0; x < doc.width; x++) {
      const color = hsv((x + 0.5) / doc.width, saturation, value);
      data.set([color.r, color.g, color.b, 255], (y * doc.width + x) * 4);
    }
  }
}
