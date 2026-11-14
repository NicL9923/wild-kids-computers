import { describe, expect, it } from 'vitest';
import { rgba } from './color.ts';
import { createDocument, DOCUMENT_HEIGHT, DOCUMENT_WIDTH, PAPER } from './document.ts';
import { DEFAULT_BYTE_CAP, History, TILE_SIZE } from './history.ts';
import { createSurface } from './surface.ts';

/** Fills a rectangle of the paint layer with one color through an open change, as a tool would. */
function paintRect(history: History, x: number, y: number, width: number, height: number, value: number): void {
  const change = history.begin();
  change.touch({ x, y, width, height });
  const { doc } = history;
  for (let row = y; row < y + height; row++) {
    for (let column = x; column < x + width; column++) {
      doc.paint.data.set([value, value, value, 255], (row * doc.width + column) * 4);
    }
  }
  history.commit(change);
}

describe('History', () => {
  it('undoes and redoes a step, restoring the exact pixels each way', () => {
    const doc = createDocument(130, 70);
    const history = new History(doc);
    const blank = doc.paint.data.slice();
    paintRect(history, 60, 10, 20, 50, 10);
    const painted = doc.paint.data.slice();
    // Undo repaints whole tiles: the square spans the first two 64 px tiles of the top row.
    const tiles = { x: 0, y: 0, width: 128, height: 64 };
    expect(history.undo()).toEqual(tiles);
    expect(doc.paint.data).toEqual(blank);
    expect(history.redo()).toEqual(tiles);
    expect(doc.paint.data).toEqual(painted);
  });

  it('saves only the tiles a change touches', () => {
    const history = new History(createDocument(256, 256));
    paintRect(history, 70, 70, 10, 10, 0);
    expect(history.bytes).toBe(TILE_SIZE * TILE_SIZE * 4);
    paintRect(history, 60, 60, 10, 10, 0);
    // That square crosses four tiles.
    expect(history.bytes).toBe(5 * TILE_SIZE * TILE_SIZE * 4);
  });

  it('walks back through many steps in order and forward again', () => {
    const doc = createDocument(64, 64);
    const history = new History(doc);
    const states = [doc.paint.data.slice()];
    for (let i = 1; i <= 5; i++) {
      paintRect(history, i * 4, 0, 8, 8, i * 40);
      states.push(doc.paint.data.slice());
    }
    for (let i = 4; i >= 0; i--) {
      history.undo();
      expect(doc.paint.data).toEqual(states[i]);
    }
    expect(history.canUndo).toBe(false);
    for (let i = 1; i <= 5; i++) {
      history.redo();
      expect(doc.paint.data).toEqual(states[i]);
    }
  });

  it('drops the redo steps when a new step follows an undo, and frees their bytes', () => {
    const history = new History(createDocument(64, 64));
    paintRect(history, 0, 0, 4, 4, 0);
    paintRect(history, 0, 0, 4, 4, 100);
    history.undo();
    expect(history.canRedo).toBe(true);
    paintRect(history, 0, 0, 4, 4, 200);
    expect(history.canRedo).toBe(false);
    expect(history.undoSteps).toBe(2);
    expect(history.bytes).toBe(2 * TILE_SIZE * TILE_SIZE * 4);
  });

  it('adds no step for a change that left every pixel as it was', () => {
    const history = new History(createDocument(64, 64));
    const change = history.begin();
    change.touch({ x: 0, y: 0, width: 64, height: 64 });
    expect(history.commit(change)).toBe(false);
    expect(history.canUndo).toBe(false);
    expect(history.bytes).toBe(0);
  });

  it('keeps 30 full-canvas steps on the real canvas under the default cap', () => {
    const doc = createDocument(DOCUMENT_WIDTH, DOCUMENT_HEIGHT);
    const history = new History(doc);
    const first = doc.paint.data.slice();
    for (let step = 1; step <= 30; step++) paintRect(history, 0, 0, DOCUMENT_WIDTH, DOCUMENT_HEIGHT, step);
    expect(history.undoSteps).toBe(30);
    expect(history.bytes).toBeLessThanOrEqual(DEFAULT_BYTE_CAP);
    for (let step = 0; step < 30; step++) history.undo();
    expect(doc.paint.data).toEqual(first);
    // About 200 MB of tiles. Instrumented runs, such as mutation testing, need longer than the default.
  }, 60_000);

  it('drops the oldest steps once the byte cap is reached, keeping the newest', () => {
    const tile = TILE_SIZE * TILE_SIZE * 4;
    const history = new History(createDocument(64, 64), { byteCap: 2 * tile });
    for (let i = 1; i <= 4; i++) paintRect(history, 0, 0, 8, 8, i * 10);
    expect(history.undoSteps).toBe(2);
    expect(history.bytes).toBe(2 * tile);
    const lone = new History(createDocument(128, 64), { byteCap: tile });
    paintRect(lone, 0, 0, 128, 8, 1);
    // A single step larger than the cap stays, so the latest action can always be undone.
    expect(lone.undoSteps).toBe(1);
  });

  it('drops the oldest steps over the step limit', () => {
    const history = new History(createDocument(64, 64), { maxSteps: 3 });
    for (let i = 1; i <= 5; i++) paintRect(history, 0, 0, 2, 2, i);
    expect(history.undoSteps).toBe(3);
  });

  it('moves the revision for every step added, undone, or redone, also while the caps drop old steps', () => {
    const tile = TILE_SIZE * TILE_SIZE * 4;
    // Byte cap and step limit each hold two steps, so from the third change on both drop one.
    for (const options of [{ byteCap: 2 * tile }, { maxSteps: 2 }]) {
      const history = new History(createDocument(64, 64), options);
      const seen: number[] = [history.revision];
      for (let i = 1; i <= 4; i++) {
        paintRect(history, 0, 0, 8, 8, i * 10);
        seen.push(history.revision);
      }
      history.undo();
      seen.push(history.revision);
      history.redo();
      seen.push(history.revision);
      expect(history.undoSteps).toBe(2);
      expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
  });

  it('keeps the revision when nothing changed: an empty commit, or undo and redo with no steps', () => {
    const history = new History(createDocument(64, 64));
    const change = history.begin();
    change.touch({ x: 0, y: 0, width: 64, height: 64 });
    history.commit(change);
    history.undo();
    history.redo();
    expect(history.revision).toBe(0);
  });

  it('makes start over and opening a coloring page undoable, mask included', () => {
    const doc = createDocument(64, 64);
    const history = new History(doc);
    paintRect(history, 0, 0, 10, 10, 0);
    const drawn = doc.paint.data.slice();
    const page = createSurface(64, 64, rgba(0, 0, 0, 255));
    history.replaceDocument(createSurface(64, 64, PAPER), page);
    expect(doc.mask).toBe(page);
    history.replaceDocument(createSurface(64, 64, PAPER), null);
    expect(doc.mask).toBeNull();
    history.undo();
    expect(doc.mask).toBe(page);
    history.undo();
    expect(doc.mask).toBeNull();
    expect(doc.paint.data).toEqual(drawn);
    history.redo();
    expect(doc.mask).toBe(page);
  });

  it('puts every pixel and the mask back when a change is discarded', () => {
    const doc = createDocument(64, 64);
    const history = new History(doc);
    const blank = doc.paint.data.slice();
    const change = history.begin();
    change.replaceMask(createSurface(64, 64));
    change.touch({ x: 0, y: 0, width: 64, height: 64 });
    doc.paint.data.fill(0);
    history.discard(change);
    expect(doc.paint.data).toEqual(blank);
    expect(doc.mask).toBeNull();
    expect(history.canUndo).toBe(false);
  });

  it('restores only the part of the saved tiles a preview asks for', () => {
    const doc = createDocument(64, 64);
    const history = new History(doc);
    const change = history.begin();
    change.touch({ x: 0, y: 0, width: 64, height: 64 });
    doc.paint.data.fill(0);
    expect(change.restore({ x: 10, y: 10, width: 5, height: 5 })).toEqual({ x: 10, y: 10, width: 5, height: 5 });
    const pixel = (x: number, y: number) => [...doc.paint.data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)];
    expect(pixel(12, 12)).toEqual([255, 255, 255, 255]);
    expect(pixel(20, 20)).toEqual([0, 0, 0, 0]);
    history.commit(change);
  });

  describe('guards', () => {
    it.each([
      ['a byte cap of zero', { byteCap: 0 }],
      ['a fractional step limit', { maxSteps: 2.5 }],
      ['a step limit of zero', { maxSteps: 0 }],
    ])('rejects %s', (_label, options) => {
      expect(() => new History(createDocument(8, 8), options)).toThrow('positive byte cap and at least one step');
    });

    it('refuses a second open change, and undo or redo while one is open', () => {
      const history = new History(createDocument(8, 8));
      history.begin();
      expect(() => history.begin()).toThrow('already open');
      expect(() => history.undo()).toThrow('Finish the open change');
      expect(() => history.redo()).toThrow('Finish the open change');
    });

    it('refuses to commit a change twice or a change from another history', () => {
      const history = new History(createDocument(8, 8));
      const change = history.begin();
      history.commit(change);
      expect(() => history.commit(change)).toThrow('not the open change');
      const other = new History(createDocument(8, 8));
      const foreign = other.begin();
      history.begin();
      expect(() => history.commit(foreign)).toThrow('not the open change');
    });

    it('refuses a replacement picture or mask of the wrong size, and leaves no change open', () => {
      const history = new History(createDocument(8, 8));
      expect(() => history.replaceDocument(createSurface(8, 9), null)).toThrow('The new picture is 8 by 9');
      expect(() => history.replaceDocument(createSurface(8, 8), createSurface(9, 8))).toThrow('The mask is 9 by 8');
      expect(() => history.replacePaint(new Uint8ClampedArray(10))).toThrow('Expected 256 bytes of paint, got 10');
      expect(() => history.begin()).not.toThrow();
    });

    it('does nothing for undo or redo with no steps', () => {
      const history = new History(createDocument(8, 8));
      expect(history.undo().width).toBe(0);
      expect(history.redo().width).toBe(0);
    });
  });
});
