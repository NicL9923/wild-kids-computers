import type { Color } from '../../../core/paint/color.ts';
import { DOCUMENT_HEIGHT, DOCUMENT_WIDTH } from '../../../core/paint/document.ts';
import { PEN_COLOR_VALUES } from './colors.ts';
import { TOLERANCE, type Canvas, type Point, type Segment } from './geometry.ts';
import { PEN_COLORS, type PenColor } from './program.ts';

/**
 * The picture a run leaves, independent of how the robot got there.
 *
 * Lines are grouped by the straight line they lie on. Along each line, pieces of one color
 * merge when they overlap or touch, and a later color paints over an earlier one where they
 * overlap, as ink would. Direction, order, splitting, and drawing a piece twice all vanish.
 * Two pictures are the same when every piece of each lies on the other in the same color,
 * within TOLERANCE.
 */

/**
 * Two unit directions within this on both axes lie along the same line. Distinct headings
 * differ by at least one degree, about 0.017, so this never joins two real directions. Across
 * the widest canvas it moves a point less than 3e-6, close to TOLERANCE.
 */
const DIRECTION_TOLERANCE = 1e-7;
/**
 * Output coordinates snap to multiples of 2^-32, so float noise far below TOLERANCE is gone.
 * Snapping turns a unit-long direction by at most about 5e-10, far inside DIRECTION_TOLERANCE,
 * so a snapped picture still lines up with the drawing it came from.
 */
const SNAP = 4294967296;

type Interval = readonly [start: number, end: number];

interface Line {
  /** Unit direction, pointing right, or straight down for a vertical line. */
  readonly ux: number;
  readonly uy: number;
  /** Signed distance of the line from the origin, along the normal (-uy, ux). */
  readonly offset: number;
}

/** The line a segment lies on, or null for a segment too short to see. */
function lineOf(segment: Segment): Line | null {
  const dx = segment.to.x - segment.from.x;
  const dy = segment.to.y - segment.from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length <= TOLERANCE) return null;
  let ux = dx / length;
  let uy = dy / length;
  if (ux < -DIRECTION_TOLERANCE || (ux <= DIRECTION_TOLERANCE && uy < 0)) {
    ux = -ux;
    uy = -uy;
  }
  const offset = ux * segment.from.y - uy * segment.from.x;
  return { ux, uy, offset };
}

function alongLine(line: Line, point: Point): number {
  return line.ux * point.x + line.uy * point.y;
}

function sameLine(a: Line, b: Line): boolean {
  return (
    Math.abs(a.ux - b.ux) <= DIRECTION_TOLERANCE &&
    Math.abs(a.uy - b.uy) <= DIRECTION_TOLERANCE &&
    Math.abs(a.offset - b.offset) <= TOLERANCE
  );
}

/** Adds an interval to a list of disjoint intervals, merging pieces that overlap or touch. */
function addInterval(list: readonly Interval[], added: Interval): Interval[] {
  let [start, end] = added;
  const out: Interval[] = [];
  for (const piece of list) {
    if (piece[1] < start - TOLERANCE || piece[0] > end + TOLERANCE) {
      out.push(piece);
    } else {
      start = Math.min(start, piece[0]);
      end = Math.max(end, piece[1]);
    }
  }
  out.push([start, end]);
  return out;
}

/** What is left of a list after taking away every interval in `removed`. Slivers vanish. */
function subtract(list: readonly Interval[], removed: readonly Interval[]): Interval[] {
  let out: readonly Interval[] = list;
  for (const [cutStart, cutEnd] of removed) {
    // Keep what lies before the cut and what lies after it. A side the cut covers comes out
    // empty or backwards, and the filter drops it with the slivers.
    out = out
      .flatMap(([start, end]): Interval[] => [
        [start, Math.min(end, cutStart)],
        [Math.max(start, cutEnd), end],
      ])
      .filter(([start, end]) => end - start > TOLERANCE);
  }
  return [...out];
}

/** The parts of a list that some interval in `kept` also covers. */
function intersect(list: readonly Interval[], kept: readonly Interval[]): Interval[] {
  return subtract(list, subtract(list, kept));
}

type Pieces = Map<PenColor, Interval[]>;

interface Group {
  readonly line: Line;
  /** The drawing, painted onto this line. */
  readonly mine: Pieces;
  /** The picture it is compared with, painted onto the same line. */
  readonly theirs: Pieces;
}

/** Paints a later piece over whatever lies under it, then merges it into its own color. */
function paint(pieces: Pieces, color: PenColor, interval: Interval) {
  for (const [other, list] of pieces) pieces.set(other, subtract(list, [interval]));
  pieces.set(color, addInterval(pieces.get(color) ?? [], interval));
}

/** Paints a drawing and the picture it is compared with onto shared lines, so pieces line up. */
function paintLines(drawing: readonly Segment[], compared: readonly Segment[] = []): Group[] {
  const groups: Group[] = [];
  const add = (segment: Segment, side: 'mine' | 'theirs') => {
    const line = lineOf(segment);
    if (line === null) return;
    let group = groups.find((candidate) => sameLine(candidate.line, line));
    if (group === undefined) {
      group = { line, mine: new Map(), theirs: new Map() };
      groups.push(group);
    }
    const a = alongLine(group.line, segment.from);
    const b = alongLine(group.line, segment.to);
    paint(group[side], segment.color, [Math.min(a, b), Math.max(a, b)]);
  };
  for (const segment of drawing) add(segment, 'mine');
  for (const segment of compared) add(segment, 'theirs');
  return groups;
}

function snap(value: number): number {
  // Scaling by a power of two is exact, and + 0 turns -0 into 0.
  return Math.round(value * SNAP) / SNAP + 0;
}

function pointAt(line: Line, t: number): Point {
  return { x: snap(line.ux * t - line.uy * line.offset), y: snap(line.uy * t + line.ux * line.offset) };
}

function toSegments(line: Line, list: readonly Interval[], color: PenColor): Segment[] {
  return list.map(([start, end]) => ({ from: pointAt(line, start), to: pointAt(line, end), color }));
}

function allOf(pieces: Pieces): Interval[] {
  let out: Interval[] = [];
  for (const list of pieces.values()) for (const piece of list) out = addInterval(out, piece);
  return out;
}

function compareSegments(a: Segment, b: Segment): number {
  return (
    PEN_COLORS.indexOf(a.color) - PEN_COLORS.indexOf(b.color) ||
    a.from.x - b.from.x ||
    a.from.y - b.from.y ||
    a.to.x - b.to.x ||
    a.to.y - b.to.y
  );
}

/**
 * The canonical picture: one segment per visible stretch of one color, each running left to
 * right (or top to bottom), sorted by color and position. Drawing the same picture another way
 * gives the same list.
 */
export function canonicalDrawing(segments: readonly Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const { line, mine } of paintLines(segments)) {
    for (const [color, list] of mine) out.push(...toSegments(line, list, color));
  }
  return out.toSorted(compareSegments);
}

export interface WrongColor {
  /** The stretch, in the color the drawing has. */
  readonly segment: Segment;
  /** The color the target has there. */
  readonly expected: PenColor;
}

export interface DrawingDifference {
  /** Stretches the drawing has and the target does not. */
  readonly extra: readonly Segment[];
  /** Stretches the target has and the drawing does not. */
  readonly missing: readonly Segment[];
  /** Stretches in the right place but the wrong color. */
  readonly wrongColor: readonly WrongColor[];
}

/** How a drawing differs from a target picture. Each list is in canonical order. */
export function compareDrawings(drawing: readonly Segment[], target: readonly Segment[]): DrawingDifference {
  const extra: Segment[] = [];
  const missing: Segment[] = [];
  const wrongColor: WrongColor[] = [];
  for (const { line, mine, theirs } of paintLines(drawing, target)) {
    const mineAll = allOf(mine);
    const theirsAll = allOf(theirs);
    for (const [color, list] of mine) {
      extra.push(...toSegments(line, subtract(list, theirsAll), color));
      for (const [expected, theirList] of theirs) {
        if (expected === color) continue;
        for (const segment of toSegments(line, intersect(list, theirList), color))
          wrongColor.push({ segment, expected });
      }
    }
    for (const [color, list] of theirs) missing.push(...toSegments(line, subtract(list, mineAll), color));
  }
  return {
    extra: extra.toSorted(compareSegments),
    missing: missing.toSorted(compareSegments),
    wrongColor: wrongColor.toSorted((a, b) => compareSegments(a.segment, b.segment)),
  };
}

/** Whether two drawings show the same picture. */
export function sameDrawing(a: readonly Segment[], b: readonly Segment[]): boolean {
  const difference = compareDrawings(a, b);
  return difference.extra.length === 0 && difference.missing.length === 0 && difference.wrongColor.length === 0;
}

/** One line for the paint studio, in document pixels. Plain data, safe to save or send. */
interface PaintLine {
  readonly from: Point;
  readonly to: Point;
  readonly color: Color;
  /** Stroke width in document pixels. */
  readonly width: number;
}

export interface PaintPicture {
  readonly width: number;
  readonly height: number;
  readonly lines: readonly PaintLine[];
}

export interface PaintOptions {
  /** Space kept clear around the drawing on each side, in document pixels. */
  readonly margin?: number;
  readonly lineWidth?: number;
}

const DEFAULT_MARGIN = 100;
const DEFAULT_LINE_WIDTH = 16;

/**
 * The robot's picture as lines on a paint studio document. The canvas scales evenly to fit
 * inside the margin and sits in the middle. The lines are the canonical picture, so a line
 * the robot drew twice is painted once.
 */
export function toPaintPicture(segments: readonly Segment[], canvas: Canvas, options: PaintOptions = {}): PaintPicture {
  const margin = options.margin ?? DEFAULT_MARGIN;
  const width = options.lineWidth ?? DEFAULT_LINE_WIDTH;
  const scale = Math.min((DOCUMENT_WIDTH - 2 * margin) / canvas.width, (DOCUMENT_HEIGHT - 2 * margin) / canvas.height);
  const left = (DOCUMENT_WIDTH - canvas.width * scale) / 2;
  const top = (DOCUMENT_HEIGHT - canvas.height * scale) / 2;
  const toDocument = (point: Point): Point => ({ x: left + point.x * scale, y: top + point.y * scale });
  return {
    width: DOCUMENT_WIDTH,
    height: DOCUMENT_HEIGHT,
    lines: canonicalDrawing(segments).map((segment) => ({
      from: toDocument(segment.from),
      to: toDocument(segment.to),
      color: PEN_COLOR_VALUES[segment.color],
      width,
    })),
  };
}
