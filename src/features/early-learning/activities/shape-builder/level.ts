import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';
import type { ShapeKind, ShapePaint } from '../../shapes/shapes.ts';
import { PICTURES, type Part, type Picture } from './pictures.ts';

/**
 * Shape builder: a picture made of shapes with some pieces missing. Each missing piece waits in
 * a tray beside the picture, and the child puts it on its outline. Difficulty takes away more
 * pieces and then adds spare shapes that belong nowhere.
 *
 * The tray is 460 by 640 units, beside the 1000 by 640 picture, and pieces in the tray are the
 * same size as their outlines.
 */

export const TRAY = { width: 460, height: 640 } as const;
/** The space between two pieces in the tray. */
const TRAY_GAP = 30;

interface Tier {
  readonly missing: number;
  readonly spares: number;
}

/** One entry per difficulty, 1 first. */
const TIERS: readonly Tier[] = [
  { missing: 2, spares: 0 },
  { missing: 3, spares: 0 },
  { missing: 2, spares: 1 },
  { missing: 3, spares: 1 },
  { missing: 4, spares: 1 },
  { missing: 4, spares: 2 },
];

export const MAX_DIFFICULTY = TIERS.length;

/** Spare shapes, each in a size close to the pieces. A spare's kind never appears in its picture. */
const SPARES: readonly Omit<Part, 'x' | 'y' | 'paint'>[] = [
  { shape: 'circle', width: 150, height: 150 },
  { shape: 'square', width: 140, height: 140 },
  { shape: 'triangle', width: 160, height: 140 },
  { shape: 'rectangle', width: 200, height: 100 },
  { shape: 'oval', width: 200, height: 120 },
  { shape: 'diamond', width: 120, height: 170 },
  { shape: 'heart', width: 140, height: 130 },
  { shape: 'star', width: 150, height: 145 },
  { shape: 'hexagon', width: 160, height: 140 },
];

const SPARE_PAINTS: readonly ShapePaint[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];

export type TileId = `tile-${number}`;

/** A shape waiting in the tray. */
export interface Tile extends Omit<Part, 'x' | 'y'> {
  readonly id: TileId;
  /** The piece it belongs to, or null for a spare. */
  readonly piece: number | null;
  /** The top left corner in tray units. */
  readonly left: number;
  readonly top: number;
}

export interface ShapeBuilderLevel {
  readonly picture: Picture;
  /** The pieces the child places, by index in the picture. The rest are drawn already. */
  readonly missing: readonly number[];
  /** The tray, in reading order. `x` and `y` are top left corners in tray units. */
  readonly tiles: readonly Tile[];
}

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Shape builder has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

type Box = Pick<Part, 'width' | 'height'>;

/**
 * Lays boxes in rows across the tray, tallest first, each row centered and the rows centered
 * top to bottom. Returns top left corners in the order given, or null when they do not fit.
 */
export function packTray(boxes: readonly Box[]): { left: number; top: number }[] | null {
  const tallestFirst = boxes.map((box, index) => ({ box, index })).toSorted((a, b) => b.box.height - a.box.height);
  const rows: (typeof tallestFirst)[] = [];
  for (const entry of tallestFirst) {
    if (entry.box.width > TRAY.width) return null;
    const row = rows.at(-1);
    if (row !== undefined && rowWidth(row) + TRAY_GAP + entry.box.width <= TRAY.width) row.push(entry);
    else rows.push([entry]);
  }
  const heights = rows.map((row) => Math.max(...row.map(({ box }) => box.height)));
  const total = heights.reduce((sum, height) => sum + height, 0) + TRAY_GAP * (rows.length - 1);
  if (total > TRAY.height) return null;
  const spots: { left: number; top: number }[] = [];
  let top = (TRAY.height - total) / 2;
  rows.forEach((row, rowIndex) => {
    const height = heights[rowIndex] ?? 0;
    let left = (TRAY.width - rowWidth(row)) / 2;
    for (const { box, index } of row) {
      // Each piece sits on the row's middle line.
      spots[index] = { left: Math.round(left), top: Math.round(top + (height - box.height) / 2) };
      left += box.width + TRAY_GAP;
    }
    top += height + TRAY_GAP;
  });
  return spots;
}

function rowWidth(row: readonly { box: Box }[]): number {
  return row.reduce((sum, { box }) => sum + box.width, 0) + TRAY_GAP * (row.length - 1);
}

/**
 * Spares whose kind is nowhere in the picture, not even in a detail such as a heart on a kite,
 * so a spare never looks like it might fit.
 */
function sparesFor(random: Random, picture: Picture, count: number): Omit<Part, 'x' | 'y'>[] {
  const kinds = new Set<ShapeKind>([...picture.pieces, ...picture.details].map((part) => part.shape));
  return random
    .sample(
      SPARES.filter((spare) => !kinds.has(spare.shape)),
      count,
    )
    .map((spare) => ({ ...spare, paint: random.pick(SPARE_PAINTS) }));
}

const ATTEMPTS = 40;

/** Pure: the same seed and difficulty give the same round in every band. */
export function generateLevel(seed: number, difficulty: number, _band: Band): ShapeBuilderLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const pictures = PICTURES.filter((picture) => picture.pieces.length >= tier.missing);
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const picture = random.pick(pictures);
    const missing = random.sample(
      picture.pieces.map((_, index) => index),
      tier.missing,
    );
    const parts: Omit<Tile, 'id' | 'left' | 'top'>[] = [
      ...picture.pieces.flatMap(({ x: _x, y: _y, ...part }, index) =>
        missing.includes(index) ? [{ ...part, piece: index }] : [],
      ),
      ...sparesFor(random, picture, tier.spares).map((part) => ({ ...part, piece: null })),
    ];
    const shuffled = random.shuffle(parts);
    const spots = packTray(shuffled);
    if (spots === null) continue;
    const tiles = shuffled.map((part, index): Tile => ({
      ...part,
      left: 0,
      top: 0,
      ...spots[index],
      id: `tile-${index}`,
    }));
    return { picture, missing: missing.toSorted((a, b) => a - b), tiles };
  }
  throw new Error(`Shape builder found no tray that fits at difficulty ${String(difficulty)}.`);
}

/** Whether a tray tile fits a piece's outline: the same shape, size, and turn. */
export function fitsPiece(tile: Omit<Part, 'x' | 'y'>, piece: Part): boolean {
  return (
    tile.shape === piece.shape &&
    tile.width === piece.width &&
    tile.height === piece.height &&
    (tile.turn ?? 0) === (piece.turn ?? 0)
  );
}
