/**
 * Whether a picture is fit to cut into puzzle pieces. A child's painting is often a few strokes
 * on white; cut into pieces, the blank ones look the same and the child can only guess where
 * they go. This measures how much each piece varies, as the spread of its brightness, and a
 * picture passes only when every piece shows something.
 */

/** The least spread of brightness, from 0 to 255, a piece needs to show something. */
export const MIN_DETAIL = 10;

/**
 * The spread of brightness in each piece of an RGBA image cut into `columns` by `rows`, row by
 * row. Transparent pixels count as white, the way a painting's paper shows.
 */
export function pieceDetail(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  columns: number,
  rows: number,
): number[] {
  if (pixels.length !== width * height * 4) {
    throw new RangeError(
      `An image ${String(width)} by ${String(height)} has ${String(width * height * 4)} values, not ${String(pixels.length)}.`,
    );
  }
  const details: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const left = Math.floor((column * width) / columns);
      const right = Math.floor(((column + 1) * width) / columns);
      const top = Math.floor((row * height) / rows);
      const bottom = Math.floor(((row + 1) * height) / rows);
      let sum = 0;
      let squares = 0;
      let count = 0;
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const at = (y * width + x) * 4;
          const alpha = (pixels[at + 3] ?? 0) / 255;
          const light = 0.299 * (pixels[at] ?? 0) + 0.587 * (pixels[at + 1] ?? 0) + 0.114 * (pixels[at + 2] ?? 0);
          const shown = light * alpha + 255 * (1 - alpha);
          sum += shown;
          squares += shown * shown;
          count += 1;
        }
      }
      if (count === 0) {
        details.push(0);
        continue;
      }
      const mean = sum / count;
      details.push(Math.sqrt(Math.max(0, squares / count - mean * mean)));
    }
  }
  return details;
}

/** True when every piece of the picture shows enough to tell it from a blank one. */
export function fitForPieces(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  columns: number,
  rows: number,
): boolean {
  return pieceDetail(pixels, width, height, columns, rows).every((detail) => detail >= MIN_DETAIL);
}
