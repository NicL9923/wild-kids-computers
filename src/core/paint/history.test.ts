import { describe, expect, it } from 'vitest';
import { rgba } from './color.ts';
import { createDocument, DOCUMENT_HEIGHT, DOCUMENT_WIDTH, PAPER } from './document.ts';
import { DEFAULT_BYTE_CAP, History, TILE_SIZE, type Change } from './history.ts';
import { createRandom } from './random.ts';
import { createSurface, type Surface } from './surface.ts';

const TILE_BYTES = TILE_SIZE * TILE_SIZE * 4;

/** What the steps really hold, read from the steps themselves rather than from the history's own total. */
function retainedBytes(history: History): number {
  // The stacks are private. Reading them here checks the reported total against what is actually kept.
  const stacks: unknown = history;
  if (!hasStacks(stacks)) throw new Error('History no longer keeps undoStack and redoStack.');
  return [...stacks.undoStack, ...stacks.redoStack].reduce((sum, step) => sum + step.bytes, 0);
}

function hasStacks(value: unknown): value is { undoStack: readonly Change[]; redoStack: readonly Change[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'undoStack' in value &&
    'redoStack' in value &&
    Array.isArray(value.undoStack) &&
    Array.isArray(value.redoStack)
  );
}

function equalBytes(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/** The accounting rules every history must keep after any operation. */
function expectHonestAccounting(history: History): void {
  expect(history.bytes).toBe(retainedBytes(history));
  // Over the cap only when a single step is left, the documented minimum so the latest action stays undoable.
  const steps = history.undoSteps + history.redoSteps;
  expect({ overCap: history.bytes > history.byteCap, steps }).toEqual(
    history.bytes > history.byteCap ? { overCap: true, steps: 1 } : { overCap: false, steps },
  );
  expect(history.undoSteps).toBeLessThanOrEqual(history.maxSteps);
}

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

  it.each([
    ['opening a page with line art', null, 'mask'],
    ['start over from a page with line art', 'mask', null],
  ] as const)('keeps the byte total and the cap honest after undoing and redoing %s', (_name, before, after) => {
    const doc = createDocument(128, 128);
    const mask = createSurface(128, 128);
    doc.mask = before === 'mask' ? mask : null;
    const history = new History(doc, { byteCap: 2 * TILE_BYTES });
    history.replaceDocument(createSurface(128, 128, PAPER), after === 'mask' ? mask : null);
    expectHonestAccounting(history);
    history.undo();
    expectHonestAccounting(history);
    history.redo();
    expectHonestAccounting(history);
    history.undo();
    for (let value = 1; value <= 4; value++) {
      paintRect(history, 0, 0, 1, 1, value);
      expectHonestAccounting(history);
    }
    // Four one-tile edits against a two-tile cap keep exactly the two newest.
    expect(history.undoSteps).toBe(2);
    expect(history.bytes).toBe(2 * TILE_BYTES);
  });

  it('keeps the step just undone when undoing it pushes the history over the cap', () => {
    const doc = createDocument(128, 128);
    const page = createSurface(128, 128);
    // Room for the one-tile edits and the page step, but not for the page's mask once undo swaps it into the step.
    const history = new History(doc, { byteCap: 5 * TILE_BYTES });
    paintRect(history, 0, 0, 1, 1, 10);
    paintRect(history, 64, 0, 1, 1, 20);
    history.replaceDocument(createSurface(128, 128, PAPER), page);
    history.undo();
    history.undo();
    expectHonestAccounting(history);
    expect(history.redoSteps).toBeGreaterThan(0);
    history.redo();
    history.redo();
    expect(doc.mask).toBe(page);
  });

  it('drops the redo step furthest from now when undoing back to the start goes over the cap', () => {
    const doc = createDocument(128, 128);
    const first = createSurface(128, 128);
    const second = createSurface(128, 128);
    // Each page step holds one mask. Undoing both makes both hold one, which is over this cap.
    const history = new History(doc, { byteCap: 1.5 * 128 * 128 * 4 });
    history.replaceDocument(createSurface(128, 128, PAPER), first);
    history.replaceDocument(createSurface(128, 128, PAPER), second);
    history.undo();
    history.undo();
    expectHonestAccounting(history);
    expect(doc.mask).toBeNull();
    // The step just undone stays, so the child can still bring the first page back.
    expect(history.redoSteps).toBe(1);
    history.redo();
    expect(doc.mask).toBe(first);
  });

  it('keeps the byte total equal to what the steps hold through a long random mix of edits', () => {
    const size = 128;
    const masks = [null, createSurface(size, size), createSurface(size, size, rgba(0, 0, 0, 255))];
    for (const seed of [1, 2, 3, 4, 5]) {
      const doc = createDocument(size, size);
      const history = new History(doc, { byteCap: 6 * TILE_BYTES, maxSteps: 8 });
      const random = createRandom(seed);
      // A model of the timeline: what the picture was after each step, and where the child is in it.
      const states: { paint: Uint8ClampedArray; mask: Surface | null }[] = [
        { paint: doc.paint.data.slice(), mask: doc.mask },
      ];
      let at = 0;
      // A change that left the picture as it was adds no step, so only a real change moves the model on.
      const record = (): void => {
        const current = states[at];
        if (current !== undefined && current.mask === doc.mask && equalBytes(current.paint, doc.paint.data)) return;
        states.length = at + 1;
        states.push({ paint: doc.paint.data.slice(), mask: doc.mask });
        at++;
      };
      // Undo and redo must land on the picture the model says is there. Collected so one assertion reports them all.
      const wrong: string[] = [];
      const expectState = (action: number, kind: string): void => {
        const expected = states[at];
        if (expected === undefined || expected.mask !== doc.mask || !equalBytes(expected.paint, doc.paint.data)) {
          wrong.push(`${kind} at action ${action}`);
        }
      };
      for (let action = 0; action < 300; action++) {
        const roll = random.int(10);
        if (roll < 4) {
          const x = random.int(size);
          const y = random.int(size);
          paintRect(history, x, y, 1 + random.int(size - x), 1 + random.int(size - y), 1 + random.int(250));
          record();
        } else if (roll < 6 && history.canUndo) {
          history.undo();
          at--;
          expectState(action, 'undo');
        } else if (roll < 8 && history.canRedo) {
          history.redo();
          at++;
          expectState(action, 'redo');
        } else if (roll < 8) {
          continue;
        } else if (roll < 9) {
          history.replaceDocument(createSurface(size, size, PAPER), masks[random.int(masks.length)] ?? null);
          record();
        } else {
          history.replacePaint(createSurface(size, size, rgba(random.int(256), 0, 0, 255)).data);
          record();
        }
        expectHonestAccounting(history);
      }
      expect(wrong, `seed ${seed}`).toEqual([]);
    }
  });

  it('drops the oldest steps over the step limit', () => {
    const history = new History(createDocument(64, 64), { maxSteps: 3 });
    for (let i = 1; i <= 5; i++) paintRect(history, 0, 0, 2, 2, i);
    expect(history.undoSteps).toBe(3);
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
