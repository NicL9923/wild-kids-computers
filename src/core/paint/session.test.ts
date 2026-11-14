import { describe, expect, it } from 'vitest';
import { flattenDocument } from './document.ts';
import { startStroke } from './session.ts';
import { createSurface } from './surface.ts';
import { newPicture, testSettings } from './testing/golden.ts';
import brush from './tools/brush/index.ts';
import { rgba } from './color.ts';

describe('startStroke', () => {
  it('makes one undo step from begin to end', () => {
    const { doc, history } = newPicture(32, 32);
    const blank = doc.paint.data.slice();
    const stroke = startStroke(history, brush, testSettings());
    stroke.begin({ x: 4, y: 4 });
    stroke.move({ x: 28, y: 28 });
    stroke.end();
    expect(history.undoSteps).toBe(1);
    history.undo();
    expect(doc.paint.data).toEqual(blank);
  });

  it('refuses any call after the stroke ended or was cancelled', () => {
    const { history } = newPicture(32, 32);
    const ended = startStroke(history, brush, testSettings());
    ended.begin({ x: 4, y: 4 });
    ended.end();
    expect(() => ended.move({ x: 5, y: 5 })).toThrow('already ended');
    expect(() => ended.end()).toThrow('already ended');
    const cancelled = startStroke(history, brush, testSettings());
    cancelled.cancel();
    expect(() => cancelled.begin({ x: 1, y: 1 })).toThrow('already ended');
  });
});

describe('flattenDocument', () => {
  it('draws the line art over the paint and leaves the paint layer alone', () => {
    const { doc, history } = newPicture(2, 1);
    const mask = createSurface(2, 1);
    mask.data.set([0, 0, 0, 255], 0);
    history.replaceDocument(createSurface(2, 1, rgba(200, 100, 0)), mask);
    expect([...flattenDocument(doc).data]).toEqual([0, 0, 0, 255, 200, 100, 0, 255]);
    expect([...doc.paint.data]).toEqual([200, 100, 0, 255, 200, 100, 0, 255]);
  });
});
