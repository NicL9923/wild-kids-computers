import { describe, expect, it } from 'vitest';
import { rgba } from '../../../core/paint/color.ts';
import { createSurface } from '../../../core/paint/surface.ts';
import round from '../../../core/paint/tips/round.ts';
import brush from '../../../core/paint/tools/brush/index.ts';
import fill from '../../../core/paint/tools/fill/index.ts';
import type { ToolSettings } from '../../../core/paint/types.ts';
import { StudioDocument } from './studioDocument.ts';

const RED: ToolSettings = { color: rgba(220, 30, 30), size: 6, tip: round, seed: 1 };

function pixel(studio: StudioDocument, x: number, y: number): number[] {
  const i = (y * studio.doc.width + x) * 4;
  return [...studio.doc.paint.data.subarray(i, i + 4)];
}

function lineMask(width: number, height: number): ReturnType<typeof createSurface> {
  const mask = createSurface(width, height);
  for (let y = 0; y < height; y++) mask.data.set([0, 0, 0, 255], (y * width + 20) * 4);
  return mask;
}

describe('StudioDocument', () => {
  it('paints a stroke, reports the area, and counts one version when it ends', () => {
    const studio = new StudioDocument(40, 20);
    studio.begin(brush, RED, { x: 5, y: 10 });
    studio.move([
      { x: 10, y: 10 },
      { x: 15, y: 10 },
    ]);
    expect(studio.version).toBe(0);
    expect(studio.canUndo).toBe(false);
    studio.end();
    expect(studio.version).toBe(1);
    expect(pixel(studio, 10, 10)).toEqual([220, 30, 30, 255]);
    const dirty = studio.takeDirty();
    expect(dirty.x).toBeLessThanOrEqual(5);
    expect(dirty.x + dirty.width).toBeGreaterThanOrEqual(15);
    expect(studio.takeDirty().width).toBe(0);
  });

  it('counts no version for a change that left every pixel as it was', () => {
    const studio = new StudioDocument(40, 20);
    studio.begin(fill, { ...RED, color: rgba(255, 255, 255) }, { x: 5, y: 5 });
    studio.end();
    expect(studio.version).toBe(0);
    expect(studio.canUndo).toBe(false);
  });

  it('undoes and redoes, bringing the coloring page id back with its mask', () => {
    const studio = new StudioDocument(40, 20);
    const mask = lineMask(40, 20);
    studio.replace(createSurface(40, 20, rgba(255, 255, 255)), mask, 'tulip');
    expect(studio.pageId).toBe('tulip');
    studio.begin(fill, RED, { x: 5, y: 5 });
    studio.end();
    // The line stops the fill.
    expect(pixel(studio, 30, 5)).toEqual([255, 255, 255, 255]);

    studio.undo();
    studio.undo();
    expect(studio.pageId).toBeNull();
    expect(studio.mask).toBeNull();
    studio.redo();
    expect(studio.pageId).toBe('tulip');
    expect(studio.version).toBe(5);
  });

  it('starts over on blank paper as one undoable step and keeps the page lines', () => {
    const studio = new StudioDocument(40, 20);
    const mask = lineMask(40, 20);
    studio.replace(createSurface(40, 20, rgba(255, 255, 255)), mask, 'tulip');
    studio.begin(fill, RED, { x: 5, y: 5 });
    studio.end();
    studio.startOver();
    expect(pixel(studio, 5, 5)).toEqual([255, 255, 255, 255]);
    expect(studio.pageId).toBe('tulip');
    studio.undo();
    expect(pixel(studio, 5, 5)).toEqual([220, 30, 30, 255]);
  });

  it('ends an open stroke before undo, so undo never meets an open change', () => {
    const studio = new StudioDocument(40, 20);
    studio.begin(brush, RED, { x: 5, y: 10 });
    studio.undo();
    expect(pixel(studio, 5, 10)).toEqual([255, 255, 255, 255]);
    expect(studio.canRedo).toBe(true);
    expect(studio.stroking).toBe(false);
  });

  it('puts every pixel back on cancel and counts nothing', () => {
    const studio = new StudioDocument(40, 20);
    studio.begin(brush, RED, { x: 5, y: 10 });
    studio.cancel();
    expect(pixel(studio, 5, 10)).toEqual([255, 255, 255, 255]);
    expect(studio.version).toBe(0);
  });

  it('counts a version for every whole-picture change once the history is full, by bytes or by steps', () => {
    // A 64 by 64 picture is one 16 KiB tile, so a byte cap of two tiles holds two steps. Each cap
    // makes the history drop its oldest step as it adds one, so the step counts stay the same.
    const tile = 64 * 64 * 4;
    for (const caps of [{ byteCap: 2 * tile }, { maxSteps: 2 }]) {
      const studio = new StudioDocument(64, 64, caps);
      for (let i = 1; i <= 6; i++) {
        studio.replacePaint(createSurface(64, 64, rgba(i * 30, 0, 0)).data);
        expect(studio.version, JSON.stringify(caps)).toBe(i);
      }
      expect(studio.history.undoSteps).toBe(2);
    }
  });

  it('notifies listeners on changes', () => {
    const studio = new StudioDocument(40, 20);
    const seen: number[] = [];
    const unsubscribe = studio.subscribe(() => seen.push(studio.version));
    studio.begin(brush, RED, { x: 5, y: 10 });
    studio.end();
    unsubscribe();
    studio.undo();
    expect(seen).toEqual([0, 1]);
  });

  it('loads a saved picture as the starting point, and only into a new document', () => {
    const studio = new StudioDocument(40, 20);
    const mask = lineMask(40, 20);
    studio.load(createSurface(40, 20, rgba(10, 20, 30)), mask, 'tulip');
    expect(pixel(studio, 3, 3)).toEqual([10, 20, 30, 255]);
    expect(studio.pageId).toBe('tulip');
    expect(studio.canUndo).toBe(false);
    expect(() => studio.load(createSurface(40, 10), null, null)).toThrow('40 by 10');
    studio.begin(fill, RED, { x: 3, y: 3 });
    studio.end();
    expect(() => studio.load(createSurface(40, 20), null, null)).toThrow('new StudioDocument');
  });

  it('offers no undo or redo while a stroke is open, and says it is stroking', () => {
    const studio = new StudioDocument(40, 20);
    studio.begin(brush, RED, { x: 5, y: 5 });
    studio.end();
    studio.begin(brush, RED, { x: 30, y: 15 });
    studio.end();
    studio.undo();
    expect(studio.canUndo).toBe(true);
    expect(studio.canRedo).toBe(true);
    studio.begin(brush, RED, { x: 5, y: 5 });
    expect(studio.stroking).toBe(true);
    expect(studio.canUndo).toBe(false);
    expect(studio.canRedo).toBe(false);
    studio.cancel();
    expect(studio.stroking).toBe(false);
    expect(studio.canUndo).toBe(true);
    expect(studio.canRedo).toBe(true);
  });

  it('ends the open stroke when another begins, so both land as steps', () => {
    const studio = new StudioDocument(40, 20);
    studio.begin(brush, RED, { x: 5, y: 5 });
    studio.begin(brush, RED, { x: 30, y: 15 });
    studio.end();
    expect(studio.version).toBe(2);
    expect(studio.history.undoSteps).toBe(2);
  });

  it('ends an open stroke before redo, replace, and whole-picture changes', () => {
    const studio = new StudioDocument(40, 20);
    studio.begin(brush, RED, { x: 5, y: 5 });
    studio.end();
    studio.undo();
    studio.begin(brush, RED, { x: 30, y: 15 });
    // Redo meets the stroke: the stroke lands, which clears the redo step.
    studio.redo();
    expect(studio.history.undoSteps).toBe(1);
    studio.begin(brush, RED, { x: 30, y: 5 });
    studio.replace(createSurface(40, 20, rgba(255, 255, 255)), null, null);
    expect(studio.history.undoSteps).toBe(3);
    studio.begin(brush, RED, { x: 10, y: 5 });
    studio.replacePaint(createSurface(40, 20, rgba(1, 2, 3)).data);
    expect(studio.history.undoSteps).toBe(5);
  });

  it('does nothing and tells no one when there is nothing to end, undo, or redo', () => {
    const studio = new StudioDocument(40, 20);
    let calls = 0;
    studio.subscribe(() => calls++);
    studio.end();
    studio.cancel();
    studio.move([{ x: 3, y: 3 }]);
    studio.undo();
    studio.redo();
    expect(calls).toBe(0);
    expect(studio.takeDirty().width).toBe(0);
    expect(studio.version).toBe(0);
  });

  it('tells listeners about undo, redo, loads, and replacements', () => {
    const studio = new StudioDocument(40, 20);
    let calls = 0;
    studio.subscribe(() => calls++);
    studio.load(createSurface(40, 20, rgba(9, 9, 9)), null, null);
    expect(calls).toBe(1);
    studio.replace(createSurface(40, 20, rgba(255, 255, 255)), null, null);
    expect(calls).toBe(2);
    studio.replacePaint(createSurface(40, 20, rgba(1, 2, 3)).data);
    expect(calls).toBe(3);
    studio.undo();
    expect(calls).toBe(4);
    studio.redo();
    expect(calls).toBe(5);
    studio.begin(brush, RED, { x: 5, y: 5 });
    studio.cancel();
    expect(calls).toBe(7);
  });

  it('remembers a page id only for a page with lines and a name', () => {
    const studio = new StudioDocument(40, 20);
    const blank = createSurface(40, 20, rgba(255, 255, 255));
    studio.replace(blank, lineMask(40, 20), null);
    expect(studio.pageId).toBeNull();
    studio.replace(blank, null, 'tulip');
    expect(studio.pageId).toBeNull();
    const loaded = new StudioDocument(40, 20);
    loaded.load(blank, lineMask(40, 20), null);
    expect(loaded.pageId).toBeNull();
    const unnamed = new StudioDocument(40, 20);
    unnamed.load(blank, null, 'tulip');
    expect(unnamed.pageId).toBeNull();
  });

  it('marks the whole picture for repainting after a load and on request', () => {
    const studio = new StudioDocument(40, 20);
    studio.load(createSurface(40, 20, rgba(9, 9, 9)), null, null);
    expect(studio.takeDirty()).toEqual({ x: 0, y: 0, width: 40, height: 20 });
    studio.invalidate();
    expect(studio.takeDirty()).toEqual({ x: 0, y: 0, width: 40, height: 20 });
  });

  it('refuses a load of the wrong width or while a stroke is open', () => {
    expect(() => new StudioDocument(40, 20).load(createSurface(30, 20), null, null)).toThrow('30 by 20');
    const stroking = new StudioDocument(40, 20);
    stroking.begin(brush, RED, { x: 5, y: 5 });
    expect(() => stroking.load(createSurface(40, 20), null, null)).toThrow('new StudioDocument');
  });
});
