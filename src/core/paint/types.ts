import type { Color } from './color.ts';
import type { DabCanvas } from './dab.ts';
import type { PaintDocument } from './document.ts';
import type { GlyphTable } from './glyphs.ts';
import type { Change } from './history.ts';
import type { Rect } from './rect.ts';
import type { Surface } from './surface.ts';

/** A point in document pixels. Pressure is 0 to 1 and defaults to 1 for a mouse. */
export interface ToolPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
}

export const SHAPE_KINDS = [
  'rectangle',
  'ellipse',
  'triangle',
  'star',
  'heart',
  'diamond',
  'hexagon',
  'moon',
  'flower',
  'arrow',
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export interface ShapeSettings {
  readonly kind: ShapeKind;
  /** filled paints the inside. outline draws the edge with the tool size as its width. */
  readonly style: 'filled' | 'outline';
}

export const PATTERN_IDS = ['stripes', 'checks', 'dots', 'zigzag'] as const;
export type PatternId = (typeof PATTERN_IDS)[number];

/** How the fill bucket paints. The main color comes from ToolSettings.color. */
export type FillStyle =
  | { readonly kind: 'solid' }
  /** From the main color to `to`, top to bottom of the region, or outward from the click. */
  | { readonly kind: 'gradient'; readonly to: Color; readonly direction: 'vertical' | 'radial' }
  /** The main color in a pattern over `background`. */
  | { readonly kind: 'pattern'; readonly pattern: PatternId; readonly background: Color };

interface TextSettings {
  readonly content: string;
  readonly font: GlyphTable;
}

export interface StampSettings {
  /** The decoded stamp picture. The renderer decodes SVG or PNG; tests decode PNG fixtures. */
  readonly bitmap: Surface;
  /** Rotation in degrees, clockwise on screen. */
  readonly rotation: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
}

/** Everything a tool may read. Tools ignore the parts they do not use. */
export interface ToolSettings {
  readonly color: Color;
  /**
   * Size in document pixels: brush diameter, line and outline width, text cap height,
   * or the longest side of a stamp.
   */
  readonly size: number;
  readonly tip: BrushTip;
  /** Seed for tips and effects that scatter things. The studio picks a new one per stroke. */
  readonly seed: number;
  readonly shape?: ShapeSettings;
  readonly fill?: FillStyle;
  readonly text?: TextSettings;
  readonly stamp?: StampSettings;
}

/** What a tool works on during one stroke. */
export interface StrokeContext {
  readonly doc: PaintDocument;
  /** The open undo step. Touch a rectangle before writing pixels in it. */
  readonly change: Change;
  readonly settings: ToolSettings;
}

/**
 * One stroke of a tool. The studio calls begin once, move any number of times, then end or
 * cancel. Each call returns the rectangle of pixels it changed, so the studio repaints only
 * that. Nothing here knows about mouse buttons: with the sticky pen, the studio calls begin on
 * one click and end on the next.
 */
export interface ToolStroke {
  begin(at: ToolPoint): Rect;
  move(to: ToolPoint): Rect;
  end(): Rect;
  /** Puts back every pixel the stroke changed. */
  cancel(): Rect;
}

export interface PaintTool {
  /** Matches the directory name: src/core/paint/tools/<id>/index.ts. */
  readonly id: string;
  /** Position in the tool bar. */
  readonly order: number;
  stroke(ctx: StrokeContext): ToolStroke;
}

/** One brush mark. The trail places dabs along the stroke at the tip's spacing. */
export interface Dab {
  readonly x: number;
  readonly y: number;
  /** Diameter in pixels. */
  readonly size: number;
  readonly color: Color;
  /** 0 for the first dab of the stroke. */
  readonly index: number;
  /** Distance along the stroke, in pixels. */
  readonly distance: number;
  /** Unit direction of travel. (1, 0) until the stroke first moves. */
  readonly dirX: number;
  readonly dirY: number;
  readonly pressure: number;
  readonly seed: number;
}

export interface BrushTip {
  /** Matches the file name: src/core/paint/tips/<id>.ts. */
  readonly id: string;
  readonly order: number;
  /** Distance between dabs as a fraction of the size. Smaller is smoother and slower. */
  readonly spacing: number;
  /** Paints one dab through the canvas. Within a stroke, a pixel keeps its highest coverage. */
  paint(canvas: DabCanvas, dab: Dab): void;
}

export const EFFECT_GROUPS = ['distort', 'color', 'paint-on', 'whole-picture'] as const;

/** An effect the child paints on with strokes, like a brush. */
interface StrokeEffect {
  /** Matches the directory name: src/core/paint/effects/<id>/index.ts. */
  readonly id: string;
  readonly order: number;
  readonly group: 'distort' | 'color' | 'paint-on';
  stroke(ctx: StrokeContext): ToolStroke;
}

/**
 * An effect on the whole picture at once. apply is a pure function from source pixels to
 * target pixels, both the same size, with a fixed cost per pixel. It reads nothing else and
 * keeps no state beyond caches keyed by size, so the studio can run it in a Web Worker.
 */
export interface PictureEffect {
  readonly id: string;
  readonly order: number;
  readonly group: 'whole-picture';
  apply(source: Surface, target: Surface): void;
}

export type PaintEffect = StrokeEffect | PictureEffect;

// Identity helpers. They check the shape at compile time, so a module cannot miss a field.
export const defineTool = (tool: PaintTool): PaintTool => tool;
export const defineTip = (tip: BrushTip): BrushTip => tip;
export const defineEffect = <T extends PaintEffect>(effect: T): T => effect;
