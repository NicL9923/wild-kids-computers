import { describe, expect, it } from 'vitest';
import { PICTURES } from './pictures.ts';
import { fitsPiece, generateLevel, MAX_DIFFICULTY, packTray, TRAY, type ShapeBuilderLevel } from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 3_571 + 2);

/** What makes a round fair: every gap has its tile, spares fit nowhere, the tray is tidy. */
function problems(level: ShapeBuilderLevel): string[] {
  const found: string[] = [];
  const { picture, missing, tiles } = level;
  if (new Set(missing).size !== missing.length) found.push('a piece is missing twice');
  for (const index of missing) {
    const piece = picture.pieces[index];
    if (piece === undefined) found.push(`no piece ${String(index)}`);
    else if (!tiles.some((tile) => tile.piece === index && fitsPiece(tile, piece)))
      found.push(`no tile for piece ${String(index)}`);
  }
  for (const tile of tiles) {
    if (tile.piece === null) {
      if (picture.pieces.some((piece) => piece.shape === tile.shape)) found.push(`spare ${tile.id} looks like a piece`);
    } else if (!missing.includes(tile.piece)) found.push(`${tile.id} belongs to a piece already drawn`);
    if (tile.left < 0 || tile.top < 0 || tile.left + tile.width > TRAY.width || tile.top + tile.height > TRAY.height) {
      found.push(`${tile.id} leaves the tray`);
    }
  }
  tiles.forEach((tile, index) => {
    for (const other of tiles.slice(index + 1)) {
      const apart =
        tile.left + tile.width <= other.left ||
        other.left + other.width <= tile.left ||
        tile.top + tile.height <= other.top ||
        other.top + other.height <= tile.top;
      if (!apart) found.push(`${tile.id} overlaps ${other.id}`);
    }
  });
  return found;
}

describe('generateLevel', () => {
  // The design table: pieces to place and spares, per difficulty.
  it.each([
    [1, 2, 0],
    [2, 3, 0],
    [3, 2, 1],
    [4, 3, 1],
    [5, 4, 1],
    [6, 4, 2],
  ])('at difficulty %i takes away %i pieces and adds %i spares', (difficulty, missing, spares) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
      expect(level.missing).toHaveLength(missing);
      expect(level.tiles.filter((tile) => tile.piece === null)).toHaveLength(spares);
    }
  });

  it('builds every picture across the easiest rounds', () => {
    const names = new Set(SEEDS.map((seed) => generateLevel(seed, 1, 'band-3-5').picture.name));
    expect([...names].toSorted()).toEqual(PICTURES.map((picture) => picture.name).toSorted());
  });

  it('repeats a round for the same seed and changes it for another', () => {
    expect(generateLevel(3, 4, 'band-6-8')).toEqual(generateLevel(3, 4, 'band-6-8'));
    expect(generateLevel(3, 4, 'band-6-8')).not.toEqual(generateLevel(4, 4, 'band-6-8'));
  });

  it.each([0, MAX_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(
      `Shape builder has difficulty 1 to 6, not ${String(difficulty)}.`,
    );
  });
});

describe('packTray', () => {
  it('centers one row of short boxes in the tray', () => {
    expect(
      packTray([
        { width: 100, height: 100 },
        { width: 200, height: 50 },
      ]),
    ).toEqual([
      { left: 65, top: 270 },
      { left: 195, top: 295 },
    ]);
  });

  it('starts a new row, tallest first, when a box would pass the edge', () => {
    expect(
      packTray([
        { width: 300, height: 100 },
        { width: 300, height: 200 },
      ]),
    ).toEqual([
      { left: 80, top: 385 },
      { left: 80, top: 155 },
    ]);
  });

  it('refuses boxes wider or taller than the tray', () => {
    expect(packTray([{ width: TRAY.width + 1, height: 10 }])).toBeNull();
    expect(
      packTray([
        { width: 300, height: 400 },
        { width: 300, height: 300 },
      ]),
    ).toBeNull();
  });
});

describe('fitsPiece', () => {
  const piece = { shape: 'triangle', x: 0, y: 0, width: 100, height: 120, turn: 90, paint: 'red' } as const;
  it.each([
    ['the same outline', {}, true],
    ['another shape', { shape: 'diamond' }, false],
    ['another width', { width: 101 }, false],
    ['another height', { height: 121 }, false],
    ['another turn', { turn: 0 }, false],
  ] as const)('fits %s: %s', (_, change, fits) => {
    expect(fitsPiece({ ...piece, ...change }, piece)).toBe(fits);
  });
});
