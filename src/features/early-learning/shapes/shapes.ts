import type { strings as shapeNames } from '../../../core/strings/shared/shapes.ts';

/**
 * The shapes the shapes activities draw, as SVG paths built in code. A shape is drawn into a
 * box of any width and height, turned a quarter at a time, so a picture can use a wide roof or a
 * cone that points down. The stroke stays even because the path itself is scaled, not the SVG.
 */

export type ShapeKind = keyof typeof shapeNames;

export const SHAPE_KINDS = [
  'circle',
  'square',
  'triangle',
  'rectangle',
  'oval',
  'diamond',
  'heart',
  'star',
  'hexagon',
] as const satisfies readonly ShapeKind[];

/** Quarter turns clockwise. */
export type Turn = 0 | 90 | 180 | 270;

type Point = readonly [number, number];
type Segment =
  | { readonly op: 'M' | 'L'; readonly to: Point }
  | { readonly op: 'C'; readonly c1: Point; readonly c2: Point; readonly to: Point };

const poly = (points: readonly Point[]): Segment[] => points.map((to, index) => ({ op: index === 0 ? 'M' : 'L', to }));

/** A five-point star with its points touching the edges of the 0 to 100 box. */
function starPoints(): Point[] {
  const raw: Point[] = Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? 50 : 20;
    const angle = (Math.PI / 5) * index - Math.PI / 2;
    return [50 + radius * Math.cos(angle), 50 + radius * Math.sin(angle)];
  });
  const xs = raw.map(([x]) => x);
  const ys = raw.map(([, y]) => y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return raw.map(([x, y]) => [((x - minX) / (maxX - minX)) * 100, ((y - minY) / (maxY - minY)) * 100]);
}

/** Each outline in a 0 to 100 box, before turning and scaling. Circles and ovals are arcs instead. */
const OUTLINES: Readonly<Record<Exclude<ShapeKind, 'circle' | 'oval'>, readonly Segment[]>> = {
  square: poly([
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ]),
  rectangle: poly([
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ]),
  triangle: poly([
    [50, 0],
    [100, 100],
    [0, 100],
  ]),
  diamond: poly([
    [50, 0],
    [100, 50],
    [50, 100],
    [0, 50],
  ]),
  hexagon: poly([
    [25, 0],
    [75, 0],
    [100, 50],
    [75, 100],
    [25, 100],
    [0, 50],
  ]),
  star: poly(starPoints()),
  heart: [
    { op: 'M', to: [50, 100] },
    { op: 'C', c1: [22, 80], c2: [0, 58], to: [0, 30] },
    { op: 'C', c1: [0, 12], c2: [13, 0], to: [27, 0] },
    { op: 'C', c1: [39, 0], c2: [47, 8], to: [50, 18] },
    { op: 'C', c1: [53, 8], c2: [61, 0], to: [73, 0] },
    { op: 'C', c1: [87, 0], c2: [100, 12], to: [100, 30] },
    { op: 'C', c1: [100, 58], c2: [78, 80], to: [50, 100] },
  ],
};

/** Turns a point in the 0 to 100 box clockwise about its center. */
function turn([x, y]: Point, by: Turn): Point {
  if (by === 90) return [100 - y, x];
  if (by === 180) return [100 - x, 100 - y];
  if (by === 270) return [y, 100 - x];
  return [x, y];
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The path for a shape filling a box `width` by `height`, kept `inset` in from every edge so a
 * stroke of twice that width stays inside the box.
 */
export function shapePath(kind: ShapeKind, width: number, height: number, by: Turn = 0, inset = 0): string {
  const w = width - inset * 2;
  const h = height - inset * 2;
  if (kind === 'circle' || kind === 'oval') {
    const [rx, ry, cy] = [round(w / 2), round(h / 2), round(inset + h / 2)];
    return `M${round(inset)} ${cy}A${rx} ${ry} 0 1 0 ${round(inset + w)} ${cy}A${rx} ${ry} 0 1 0 ${round(inset)} ${cy}Z`;
  }
  const at = (point: Point): string => {
    const [x, y] = turn(point, by);
    return `${round(inset + (x / 100) * w)} ${round(inset + (y / 100) * h)}`;
  };
  const parts = OUTLINES[kind].map((segment) =>
    segment.op === 'C' ? `C${at(segment.c1)} ${at(segment.c2)} ${at(segment.to)}` : `${segment.op}${at(segment.to)}`,
  );
  return `${parts.join('')}Z`;
}

/** The paints a shape piece can wear, by name, so levels stay plain data. */
export const SHAPE_PAINTS = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'brown',
  'gray',
  'white',
  'sky',
  'dark',
] as const;
export type ShapePaint = (typeof SHAPE_PAINTS)[number];
