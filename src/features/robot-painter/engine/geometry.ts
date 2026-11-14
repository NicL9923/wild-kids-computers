import { cos, degreesToRadians, sin } from '../../../core/paint/math.ts';
import type { MoveDirection, PenColor } from './program.ts';

/**
 * Positions are in canvas units. One arrow step is one unit. x grows to the right and y grows
 * down, as on screen. A heading is whole degrees clockwise from up: 0 is up, 90 is right.
 *
 * Turns by angle give positions that are not whole numbers, so two positions are the same when
 * they are within TOLERANCE of each other on both axes. Floating point error after the longest
 * program the step cap allows stays below 1e-9, far inside it.
 */
export const TOLERANCE = 1e-6;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Segment {
  readonly from: Point;
  readonly to: Point;
  readonly color: PenColor;
}

/** The drawing area in canvas units. The robot stays on 0..width by 0..height, edges included. */
export interface Canvas {
  readonly width: number;
  readonly height: number;
}

export const DIRECTION_HEADINGS: Readonly<Record<MoveDirection, number>> = {
  up: 0,
  right: 90,
  down: 180,
  left: 270,
};

/** A heading in 0..359 for any whole number of degrees. */
export function normalizeHeading(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/**
 * The unit step for a heading in whole degrees. The step within a quarter turn comes from the
 * paint engine's exact sine and cosine, and each further quarter turn rotates it exactly, so
 * opposite headings cancel exactly and the four arrow headings step by exactly 0 and 1.
 */
export function unitStep(heading: number): Point {
  const normal = normalizeHeading(heading);
  const radians = degreesToRadians(normal % 90);
  const x = sin(radians);
  const y = -cos(radians);
  // Each quarter turn clockwise on screen maps (x, y) to (-y, x).
  switch (Math.floor(normal / 90)) {
    case 0:
      return { x, y };
    case 1:
      return { x: -y, y: x };
    case 2:
      return { x: -x, y: -y };
    default:
      return { x: y, y: -x };
  }
}

export function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) <= TOLERANCE && Math.abs(a.y - b.y) <= TOLERANCE;
}

export function insideCanvas(point: Point, canvas: Canvas): boolean {
  return (
    point.x >= -TOLERANCE &&
    point.y >= -TOLERANCE &&
    point.x <= canvas.width + TOLERANCE &&
    point.y <= canvas.height + TOLERANCE
  );
}
