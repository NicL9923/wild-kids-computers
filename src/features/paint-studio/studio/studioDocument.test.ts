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

  it('keeps counting versions once the history is full and drops its oldest step', () => {
    const studio = new StudioDocument(40, 20);
    const max = studio.history.maxSteps;
    for (let i = 0; i <= max; i++) {
      const pixels = createSurface(40, 20, rgba(i % 2 === 0 ? 10 : 200, 0, 0)).data;
      studio.replacePaint(pixels);
    }
    expect(studio.history.undoSteps).toBe(max);
    expect(studio.version).toBe(max + 1);
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
});
