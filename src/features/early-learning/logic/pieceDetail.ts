/**
 * Whether a picture is fit to cut into puzzle pieces. A child's painting is often a few strokes
 * on white; cut into pieces, the blank ones look the same and the child can only guess where
 * they go. A painting can also repeat itself, such as stripes across the page, so that pieces
 * full of paint still look alike. A picture passes only when every piece shows something and
 * no two pieces look alike, because the jigsaw takes a piece only in its own place.
 */

/** The least spread of brightness, from 0 to 255, a piece needs to show something. */
export const MIN_DETAIL = 10;

/** The least average color difference, from 0 to 255 per channel, between two pieces that look different. */
export const MIN_DIFFERENCE = 12;

/** Each piece is compared as this many cells across and down, so a piece and its look-alike compare cell by cell. */
const GRID = 8;

interface Bounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

function pieceBounds(width: number, height: number, columns: number, rows: number, index: number): Bounds {
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    left: Math.floor((column * width) / columns),
    right: Math.floor(((column + 1) * width) / columns),
    top: Math.floor((row * height) / rows),
    bottom: Math.floor(((row + 1) * height) / rows),
  };
}

function checkSize(pixels: Uint8ClampedArray, width: number, height: number): void {
  if (pixels.length !== width * height * 4) {
    throw new RangeError(
      `An image ${String(width)} by ${String(height)} has ${String(width * height * 4)} values, not ${String(pixels.length)}.`,
    );
  }
}

/** The color a pixel shows on white paper, as [r, g, b]. */
function shownColor(pixels: Uint8ClampedArray, at: number): [number, number, number] {
  const alpha = (pixels[at + 3] ?? 0) / 255;
  const on = (value: number | undefined) => (value ?? 0) * alpha + 255 * (1 - alpha);
  return [on(pixels[at]), on(pixels[at + 1]), on(pixels[at + 2])];
}

/** A piece's average color in each grid cell, or null for a cell too small to hold a pixel. */
function cellColors(pixels: Uint8ClampedArray, width: number, bounds: Bounds): ([number, number, number] | null)[] {
  const sums = Array.from({ length: GRID * GRID }, () => [0, 0, 0, 0]);
  const pieceWidth = bounds.right - bounds.left;
  const pieceHeight = bounds.bottom - bounds.top;
  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    const cellY = Math.floor(((y - bounds.top) * GRID) / pieceHeight);
    for (let x = bounds.left; x < bounds.right; x += 1) {
      const cell = sums[cellY * GRID + Math.floor(((x - bounds.left) * GRID) / pieceWidth)];
      if (cell === undefined) continue;
      const [r, g, b] = shownColor(pixels, (y * width + x) * 4);
      cell[0] = (cell[0] ?? 0) + r;
      cell[1] = (cell[1] ?? 0) + g;
      cell[2] = (cell[2] ?? 0) + b;
      cell[3] = (cell[3] ?? 0) + 1;
    }
  }
  return sums.map(([r = 0, g = 0, b = 0, count = 0]) => (count === 0 ? null : [r / count, g / count, b / count]));
}

/**
 * The pairs of pieces, by index row by row, whose cells differ on average by less than
 * MIN_DIFFERENCE. A child cannot tell such pieces apart.
 */
export function piecesAlike(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  columns: number,
  rows: number,
): [number, number][] {
  checkSize(pixels, width, height);
  const cells = Array.from({ length: columns * rows }, (_, index) =>
    cellColors(pixels, width, pieceBounds(width, height, columns, rows, index)),
  );
  const alike: [number, number][] = [];
  for (let a = 0; a < cells.length; a += 1) {
    for (let b = a + 1; b < cells.length; b += 1) {
      let total = 0;
      let compared = 0;
      cells[a]?.forEach((first, cell) => {
        const second = cells[b]?.[cell];
        if (first === null || second === null || second === undefined) return;
        total += (Math.abs(first[0] - second[0]) + Math.abs(first[1] - second[1]) + Math.abs(first[2] - second[2])) / 3;
        compared += 1;
      });
      if (compared > 0 && total / compared < MIN_DIFFERENCE) alike.push([a, b]);
    }
  }
  return alike;
}

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
  checkSize(pixels, width, height);
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

/** True when every piece of the picture shows enough to tell it from a blank one, and from every other piece. */
export function fitForPieces(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  columns: number,
  rows: number,
): boolean {
  return (
    pieceDetail(pixels, width, height, columns, rows).every((detail) => detail >= MIN_DETAIL) &&
    piecesAlike(pixels, width, height, columns, rows).length === 0
  );
}
