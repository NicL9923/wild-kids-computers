import { createDocument, PAPER } from '../../../core/paint/document.ts';
import { History } from '../../../core/paint/history.ts';
import { EMPTY_RECT, unionRect, type Rect } from '../../../core/paint/rect.ts';
import { startStroke, type StrokePainter } from '../../../core/paint/session.ts';
import { createSurface, type Surface } from '../../../core/paint/surface.ts';
import type { PaintDocument } from '../../../core/paint/document.ts';
import type { ToolPoint, ToolSettings, ToolStroke } from '../../../core/paint/types.ts';

/**
 * One picture in the studio: the engine's document and history, the stroke in progress, the area
 * that needs repainting, and a version that changes whenever the picture does. React reads it
 * through `subscribe`. Nothing here touches the DOM, so tests drive it directly.
 */
export class StudioDocument {
  readonly doc: PaintDocument;
  readonly history: History;
  private stroke: ToolStroke | null = null;
  private dirty: Rect = EMPTY_RECT;
  private readonly listeners = new Set<() => void>();
  /** Coloring page ids by mask, so undo and redo bring the right page id back with the mask. */
  private readonly pageIds = new WeakMap<Surface, string>();
  private versionCount = 0;

  constructor(width?: number, height?: number) {
    this.doc = createDocument(width, height);
    this.history = new History(this.doc);
  }

  /** Changes whenever the picture changes: a stroke ends, undo, redo, or a whole-picture change. */
  get version(): number {
    return this.versionCount;
  }

  get canUndo(): boolean {
    return this.stroke === null && this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.stroke === null && this.history.canRedo;
  }

  get stroking(): boolean {
    return this.stroke !== null;
  }

  /** The coloring page under the paint, or null on blank paper. */
  get pageId(): string | null {
    const mask = this.doc.mask;
    return mask === null ? null : (this.pageIds.get(mask) ?? null);
  }

  /** The current mask, which changes only through history steps. */
  get mask(): Surface | null {
    return this.doc.mask;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The area changed since the last call, and resets it. */
  takeDirty(): Rect {
    const dirty = this.dirty;
    this.dirty = EMPTY_RECT;
    return dirty;
  }

  begin(painter: StrokePainter, settings: ToolSettings, at: ToolPoint): void {
    if (this.stroke !== null) this.end();
    this.stroke = startStroke(this.history, painter, settings);
    this.paint(this.stroke.begin(at));
    this.emit();
  }

  move(points: readonly ToolPoint[]): void {
    const stroke = this.stroke;
    if (stroke === null) return;
    let changed = EMPTY_RECT;
    for (const point of points) changed = unionRect(changed, stroke.move(point));
    this.paint(changed);
  }

  /** Commits the stroke in progress. Does nothing when no stroke is open. */
  end(): void {
    const stroke = this.stroke;
    if (stroke === null) return;
    this.stroke = null;
    const before = this.stepCounts();
    this.paint(stroke.end());
    this.countIfChanged(before);
    this.emit();
  }

  cancel(): void {
    const stroke = this.stroke;
    if (stroke === null) return;
    this.stroke = null;
    this.paint(stroke.cancel());
    this.emit();
  }

  undo(): void {
    this.end();
    if (!this.history.canUndo) return;
    this.paint(this.history.undo());
    this.versionCount++;
    this.emit();
  }

  redo(): void {
    this.end();
    if (!this.history.canRedo) return;
    this.paint(this.history.redo());
    this.versionCount++;
    this.emit();
  }

  /**
   * Puts a saved picture in place before any history exists, such as when opening a gallery
   * picture. It is the starting point, so undo cannot go behind it. Throws once the history has a step.
   */
  load(paint: Surface, mask: Surface | null, pageId: string | null): void {
    if (this.history.canUndo || this.history.canRedo || this.stroke !== null) {
      throw new Error('Load a picture only into a new StudioDocument.');
    }
    if (paint.width !== this.doc.width || paint.height !== this.doc.height) {
      throw new RangeError(
        `The picture is ${paint.width} by ${paint.height}, but the document is ${this.doc.width} by ${this.doc.height}.`,
      );
    }
    if (mask !== null && pageId !== null) this.pageIds.set(mask, pageId);
    this.doc.paint.data.set(paint.data);
    this.doc.mask = mask;
    this.invalidate();
    this.emit();
  }

  /** Blank paper as one undoable step. A coloring page keeps its lines, so the child starts the page over. */
  startOver(): void {
    this.replace(createSurface(this.doc.width, this.doc.height, PAPER), this.doc.mask, this.pageId);
  }

  /** Replaces the paint and the mask as one undoable step, such as opening a coloring page. */
  replace(paint: Surface, mask: Surface | null, pageId: string | null): void {
    this.end();
    if (mask !== null && pageId !== null) this.pageIds.set(mask, pageId);
    const before = this.stepCounts();
    this.paint(this.history.replaceDocument(paint, mask));
    this.countIfChanged(before);
    this.emit();
  }

  /** Replaces the paint layer as one undoable step: the result of a whole-picture effect. */
  replacePaint(pixels: Uint8ClampedArray): void {
    this.end();
    const before = this.stepCounts();
    this.paint(this.history.replacePaint(pixels));
    this.countIfChanged(before);
    this.emit();
  }

  /** Marks everything for repainting, such as after the canvas element is replaced. */
  invalidate(): void {
    this.paint({ x: 0, y: 0, width: this.doc.width, height: this.doc.height });
  }

  private stepCounts(): string {
    return `${this.history.undoSteps}/${this.history.redoSteps}`;
  }

  /**
   * Counts a new version when the history gained a step. A full history drops its oldest step as
   * it adds one, so the counts stay the same; then it counts anyway, because an extra save is
   * harmless and a missed one loses paint.
   */
  private countIfChanged(before: string): void {
    const full = this.history.undoSteps >= this.history.maxSteps;
    if (full || this.stepCounts() !== before) this.versionCount++;
  }

  private paint(rect: Rect): void {
    this.dirty = unionRect(this.dirty, rect);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
