import { describe, expect, it } from 'vitest';
import { strings as emojiNames } from '../../../../core/strings/shared/emoji.ts';
import { BOARD, PICTURES, type Part } from './pictures.ts';

/** The smallest side of a piece in board units: big enough to aim at in the youngest band. */
const SMALLEST_PIECE = 100;

const box = (part: Part) => ({
  left: part.x - part.width / 2,
  right: part.x + part.width / 2,
  top: part.y - part.height / 2,
  bottom: part.y + part.height / 2,
});

/** True when two pieces cover some of the same ground. Touching edges is fine. */
function overlap(a: Part, b: Part): boolean {
  const [one, two] = [box(a), box(b)];
  return one.left < two.right && two.left < one.right && one.top < two.bottom && two.top < one.bottom;
}

describe('PICTURES', () => {
  it.each(PICTURES.map((picture) => [picture.name, picture] as const))(
    '%s is a fair picture to build',
    (_, picture) => {
      expect(picture.pieces.length).toBeGreaterThanOrEqual(2);
      picture.pieces.forEach((piece, index) => {
        const edges = box(piece);
        expect(edges.left).toBeGreaterThanOrEqual(0);
        expect(edges.top).toBeGreaterThanOrEqual(0);
        expect(edges.right).toBeLessThanOrEqual(BOARD.width);
        expect(edges.bottom).toBeLessThanOrEqual(BOARD.height);
        expect(Math.min(piece.width, piece.height)).toBeGreaterThanOrEqual(SMALLEST_PIECE);
        // Two outlines on the same ground would make a drop land in either.
        for (const other of picture.pieces.slice(index + 1))
          expect(overlap(piece, other), `${picture.name} ${String(index)}`).toBe(false);
      });
      // A circle that is not round would be an oval: the name the child hears must be true.
      const roundShapes = picture.pieces.filter((piece) => piece.shape === 'circle' || piece.shape === 'square');
      for (const piece of roundShapes) expect(piece.width).toBe(piece.height);
      const longShapes = picture.pieces.filter((piece) => piece.shape === 'oval' || piece.shape === 'rectangle');
      for (const piece of longShapes) expect(piece.width).not.toBe(piece.height);
      // Pieces with the same outline must look the same, so either one is right in either place.
      const twins = picture.pieces.flatMap((piece) =>
        picture.pieces
          .filter(
            (other) =>
              piece.shape === other.shape &&
              piece.width === other.width &&
              piece.height === other.height &&
              (piece.turn ?? 0) === (other.turn ?? 0),
          )
          .map((other) => [piece.paint, other.paint] as const),
      );
      for (const [paint, other] of twins) expect(other).toBe(paint);
      for (const detail of picture.details) expect(picture.pieces[detail.on], `${picture.name} detail`).toBeDefined();
    },
  );

  it('names every picture with a spoken word', () => {
    const emojiNamed = PICTURES.flatMap((picture) => (picture.name === 'robot' ? [] : [picture.name]));
    for (const name of emojiNamed) expect(emojiNames[name]).toBeDefined();
    expect(new Set(PICTURES.map((picture) => picture.name)).size).toBe(PICTURES.length);
  });
});
