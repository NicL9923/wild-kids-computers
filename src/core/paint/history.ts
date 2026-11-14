import type { PaintDocument } from './document.ts';
import { EMPTY_RECT, clipRect, intersectRect, isEmptyRect, unionRect, type Rect } from './rect.ts';
import type { Surface } from './surface.ts';

/**
 * Undo and redo.
 *
 * The paint layer is cut into 64 px tiles. A change copies a tile the first time anything
 * touches it, so a stroke stores only the tiles it changed. Undo swaps each saved tile with
 * the pixels in the document, which turns the step into its own redo with no second copy.
 * A step that replaces the document also keeps the previous mask.
 */

export const TILE_SIZE = 64;
const TILE_SHIFT = 6;
const TILE_BYTES = TILE_SIZE * TILE_SIZE * 4;

/** 256 MiB. Thirty full-canvas steps at 1600 by 1000 take about 197 MB, so they fit. */
export const DEFAULT_BYTE_CAP = 256 * 1024 * 1024;
/** A ceiling on step count, so many tiny steps cannot pile up without limit. */
export const DEFAULT_MAX_STEPS = 100;

interface SavedMask {
  mask: Surface | null;
}

/** One open or finished step: the tiles it saved and, if it replaced the mask, the old mask. */
export class Change {
  readonly doc: PaintDocument;
  private readonly columns: number;
  private readonly rows: number;
  /** Saved tile data by tile index. While open: pixels from before. After undo: pixels from after. */
  private readonly tiles = new Map<number, Uint8ClampedArray>();
  /** The same tiles by index, for a fast lookup per pixel. */
  private readonly tileArray: (Uint8ClampedArray | undefined)[];
  private savedMask: SavedMask | null = null;
  private touched: Rect = EMPTY_RECT;
  /** @internal The history this change belongs to. */
  readonly owner: History;

  constructor(owner: History, doc: PaintDocument) {
    this.owner = owner;
    this.doc = doc;
    this.columns = Math.ceil(doc.width / TILE_SIZE);
    this.rows = Math.ceil(doc.height / TILE_SIZE);
    this.tileArray = Array.from({ length: this.columns * this.rows });
  }

  get bounds(): Rect {
    return this.touched;
  }

  get isEmpty(): boolean {
    return this.tiles.size === 0 && this.savedMask === null;
  }

  get bytes(): number {
    const mask = this.savedMask?.mask;
    return this.tiles.size * TILE_BYTES + (mask === null || mask === undefined ? 0 : mask.data.byteLength);
  }

  /** Saves every tile inside rect that this change has not saved yet. Call it before writing pixels. */
  touch(rect: Rect): void {
    const area = clipRect(rect, this.doc.width, this.doc.height);
    if (isEmptyRect(area)) return;
    this.touched = unionRect(this.touched, area);
    const firstColumn = area.x >> TILE_SHIFT;
    const lastColumn = (area.x + area.width - 1) >> TILE_SHIFT;
    const firstRow = area.y >> TILE_SHIFT;
    const lastRow = (area.y + area.height - 1) >> TILE_SHIFT;
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) this.save(row * this.columns + column);
    }
  }

  /** The saved copy of the tile that holds pixel (x, y), saving it first. Offsets inside use tileOffset. */
  tileAt(x: number, y: number): Uint8ClampedArray {
    const index = (y >> TILE_SHIFT) * this.columns + (x >> TILE_SHIFT);
    return this.tileArray[index] ?? this.save(index);
  }

  /** Copies saved pixels back into the document inside rect. Tools use it to redraw a preview. */
  restore(rect: Rect): Rect {
    const area = intersectRect(rect, this.touched);
    if (isEmptyRect(area)) return EMPTY_RECT;
    for (const [index, saved] of this.tiles) {
      const part = intersectRect(area, this.tileRect(index));
      if (!isEmptyRect(part)) this.copy(index, saved, part, 'to-document');
    }
    return area;
  }

  /** Restores everything this change touched, including the mask. Returns the area to repaint. */
  revert(): Rect {
    if (this.savedMask !== null) {
      this.doc.mask = this.savedMask.mask;
      this.savedMask = null;
    }
    const area = this.restore(this.touched);
    this.tiles.clear();
    this.tileArray.fill(undefined);
    const all = this.touched;
    this.touched = EMPTY_RECT;
    return isEmptyRect(area) ? all : area;
  }

  /** Replaces the document mask, keeping the first mask it replaced. */
  replaceMask(mask: Surface | null): void {
    if (mask !== null && (mask.width !== this.doc.width || mask.height !== this.doc.height)) {
      throw new RangeError(
        `The mask is ${mask.width} by ${mask.height}, but the document is ${this.doc.width} by ${this.doc.height}.`,
      );
    }
    this.savedMask ??= { mask: this.doc.mask };
    this.doc.mask = mask;
    this.touched = unionRect(this.touched, { x: 0, y: 0, width: this.doc.width, height: this.doc.height });
  }

  /** @internal Forgets saved tiles whose pixels did not change, so a no-op adds no step and holds no memory. */
  prune(): void {
    const doc = this.doc.paint.data;
    for (const [index, saved] of this.tiles) {
      const rect = this.tileRect(index);
      const tileX = (index % this.columns) * TILE_SIZE;
      const tileY = Math.floor(index / this.columns) * TILE_SIZE;
      let same = true;
      for (let y = rect.y; y < rect.y + rect.height && same; y++) {
        const docStart = (y * this.doc.width + rect.x) * 4;
        const tileStart = ((y - tileY) * TILE_SIZE + (rect.x - tileX)) * 4;
        for (let i = 0; i < rect.width * 4; i++) {
          if (doc[docStart + i] !== saved[tileStart + i]) {
            same = false;
            break;
          }
        }
      }
      if (same) {
        this.tiles.delete(index);
        this.tileArray[index] = undefined;
      }
    }
    if (this.savedMask !== null && this.savedMask.mask === this.doc.mask) this.savedMask = null;
  }

  /** @internal Swaps saved tiles and mask with the document. Undo and redo are the same operation. */
  swap(): Rect {
    for (const [index, saved] of this.tiles) this.copy(index, saved, this.tileRect(index), 'swap');
    if (this.savedMask !== null) {
      const current = this.doc.mask;
      this.doc.mask = this.savedMask.mask;
      this.savedMask.mask = current;
    }
    return this.touched;
  }

  private save(index: number): Uint8ClampedArray {
    const existing = this.tiles.get(index);
    if (existing !== undefined) return existing;
    const saved = new Uint8ClampedArray(TILE_BYTES);
    this.tiles.set(index, saved);
    this.tileArray[index] = saved;
    this.copy(index, saved, this.tileRect(index), 'from-document');
    this.touched = unionRect(this.touched, this.tileRect(index));
    return saved;
  }

  private tileRect(index: number): Rect {
    const x = (index % this.columns) * TILE_SIZE;
    const y = Math.floor(index / this.columns) * TILE_SIZE;
    return clipRect({ x, y, width: TILE_SIZE, height: TILE_SIZE }, this.doc.width, this.doc.height);
  }

  private copy(
    index: number,
    saved: Uint8ClampedArray,
    part: Rect,
    mode: 'from-document' | 'to-document' | 'swap',
  ): void {
    const doc = this.doc.paint.data;
    const tileX = (index % this.columns) * TILE_SIZE;
    const tileY = Math.floor(index / this.columns) * TILE_SIZE;
    const rowBytes = part.width * 4;
    for (let y = part.y; y < part.y + part.height; y++) {
      const docStart = (y * this.doc.width + part.x) * 4;
      const tileStart = ((y - tileY) * TILE_SIZE + (part.x - tileX)) * 4;
      if (mode === 'from-document') {
        saved.set(doc.subarray(docStart, docStart + rowBytes), tileStart);
      } else if (mode === 'to-document') {
        doc.set(saved.subarray(tileStart, tileStart + rowBytes), docStart);
      } else {
        for (let i = 0; i < rowBytes; i++) {
          const kept = saved[tileStart + i] ?? 0;
          saved[tileStart + i] = doc[docStart + i] ?? 0;
          doc[docStart + i] = kept;
        }
      }
    }
  }

  /** Rows and columns of tiles, for code that walks tiles directly. */
  get tileGrid(): { columns: number; rows: number } {
    return { columns: this.columns, rows: this.rows };
  }
}

/** Byte offset of pixel (x, y) inside the saved copy of its tile. */
export function tileOffset(x: number, y: number): number {
  return (((y & (TILE_SIZE - 1)) << TILE_SHIFT) + (x & (TILE_SIZE - 1))) * 4;
}

export interface HistoryOptions {
  byteCap?: number;
  maxSteps?: number;
}

export class History {
  readonly doc: PaintDocument;
  readonly byteCap: number;
  readonly maxSteps: number;
  private readonly undoStack: Change[] = [];
  private readonly redoStack: Change[] = [];
  private open: Change | null = null;
  private storedBytes = 0;

  constructor(doc: PaintDocument, options: HistoryOptions = {}) {
    this.doc = doc;
    this.byteCap = options.byteCap ?? DEFAULT_BYTE_CAP;
    this.maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    if (!(this.byteCap > 0) || !Number.isInteger(this.maxSteps) || this.maxSteps < 1) {
      throw new RangeError('History needs a positive byte cap and at least one step.');
    }
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoSteps(): number {
    return this.undoStack.length;
  }

  get redoSteps(): number {
    return this.redoStack.length;
  }

  /** Bytes held by every undo and redo step. */
  get bytes(): number {
    return this.storedBytes;
  }

  /** Opens a change. Only one change is open at a time, so two tools cannot interleave. */
  begin(): Change {
    if (this.open !== null) throw new Error('A change is already open. Commit or discard it first.');
    this.open = new Change(this, this.doc);
    return this.open;
  }

  /** Closes the open change and keeps it as an undo step. A change that left every pixel and the mask as they were adds no step. Returns whether it added one. */
  commit(change: Change): boolean {
    this.close(change);
    change.prune();
    if (change.isEmpty) return false;
    for (const step of this.redoStack) this.storedBytes -= step.bytes;
    this.redoStack.length = 0;
    this.undoStack.push(change);
    this.storedBytes += change.bytes;
    // Drop the oldest steps over the cap, but always keep the newest one.
    while (this.undoStack.length > 1 && (this.storedBytes > this.byteCap || this.undoStack.length > this.maxSteps)) {
      const oldest = this.undoStack.shift();
      if (oldest !== undefined) this.storedBytes -= oldest.bytes;
    }
    return true;
  }

  /** Closes the open change and puts back everything it touched. Returns the area to repaint. */
  discard(change: Change): Rect {
    this.close(change);
    return change.revert();
  }

  undo(): Rect {
    this.assertClosed();
    const step = this.undoStack.pop();
    if (step === undefined) return EMPTY_RECT;
    this.redoStack.push(step);
    return step.swap();
  }

  redo(): Rect {
    this.assertClosed();
    const step = this.redoStack.pop();
    if (step === undefined) return EMPTY_RECT;
    this.undoStack.push(step);
    return step.swap();
  }

  /**
   * Replaces the whole picture as one undoable step, saving the mask too. "Start over" passes
   * blank paper, and opening a coloring page passes blank paper and the page's line art.
   */
  replaceDocument(paint: Surface, mask: Surface | null): Rect {
    const doc = this.doc;
    if (paint.width !== doc.width || paint.height !== doc.height) {
      throw new RangeError(
        `The new picture is ${paint.width} by ${paint.height}, but the document is ${doc.width} by ${doc.height}.`,
      );
    }
    const change = this.begin();
    try {
      const all = { x: 0, y: 0, width: doc.width, height: doc.height };
      change.replaceMask(mask);
      change.touch(all);
      doc.paint.data.set(paint.data);
      this.commit(change);
      return all;
    } catch (error) {
      this.discard(change);
      throw error;
    }
  }

  /** Replaces the paint layer as one undoable step. A whole-picture effect from a worker lands here. */
  replacePaint(pixels: Uint8ClampedArray): Rect {
    const doc = this.doc;
    if (pixels.length !== doc.paint.data.length) {
      throw new RangeError(`Expected ${doc.paint.data.length} bytes of paint, got ${pixels.length}.`);
    }
    const change = this.begin();
    const all = { x: 0, y: 0, width: doc.width, height: doc.height };
    change.touch(all);
    doc.paint.data.set(pixels);
    this.commit(change);
    return all;
  }

  private close(change: Change): void {
    if (change.owner !== this || this.open !== change) {
      throw new Error('This change is not the open change of this history.');
    }
    this.open = null;
  }

  private assertClosed(): void {
    if (this.open !== null) throw new Error('Finish the open change before undo or redo.');
  }
}
