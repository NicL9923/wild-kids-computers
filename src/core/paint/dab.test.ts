import { describe, expect, it } from 'vitest';
import { DabCanvas, DabTrail, discCoverage } from './dab.ts';
import { createDocument } from './document.ts';
import { History } from './history.ts';

describe('DabTrail', () => {
  it('places dabs at an even spacing along the path, carrying the remainder between moves', () => {
    const trail = new DabTrail(10);
    const places: { x: number; distance: number; index: number }[] = [];
    const emit = (place: { x: number; distance: number; index: number }) => places.push(place);
    trail.begin({ x: 0, y: 0 }, emit);
    trail.move({ x: 15, y: 0 }, emit);
    trail.move({ x: 25, y: 0 }, emit);
    trail.move({ x: 25, y: 0 }, emit);
    expect(places.map(({ x, distance, index }) => [x, distance, index])).toEqual([
      [0, 0, 0],
      [10, 10, 1],
      [20, 20, 2],
    ]);
  });

  it('reports the direction of travel and blends pressure along a segment', () => {
    const trail = new DabTrail(5);
    const places: { dirX: number; dirY: number; pressure: number }[] = [];
    trail.begin({ x: 0, y: 0, pressure: 0 }, (p) => places.push(p));
    trail.move({ x: 0, y: 10, pressure: 1 }, (p) => places.push(p));
    expect(places.map((p) => [p.dirX, p.dirY, p.pressure])).toEqual([
      [1, 0, 0],
      [0, 1, 0.5],
      [0, 1, 1],
    ]);
  });

  it('never spaces dabs closer than one pixel', () => {
    const trail = new DabTrail(0.01);
    let count = 0;
    trail.begin({ x: 0, y: 0 }, () => (count += 1));
    trail.move({ x: 10, y: 0 }, () => (count += 1));
    expect(count).toBe(11);
  });

  it('ignores a move before begin', () => {
    let count = 0;
    new DabTrail(1).move({ x: 10, y: 0 }, () => (count += 1));
    expect(count).toBe(0);
  });
});

const red = (doc: { paint: { data: Uint8ClampedArray } }): number[] => [...doc.paint.data.subarray(0, 4)];

function setup() {
  const doc = createDocument(8, 8);
  const history = new History(doc);
  const change = history.begin();
  return { doc, history, change, canvas: new DabCanvas(doc, change) };
}

describe('DabCanvas', () => {
  it('keeps the highest coverage a stroke gave a pixel, so overlapping dabs do not darken it', () => {
    const { doc, canvas } = setup();
    canvas.put(0, 0, 128, 255, 0, 0);
    const half = red(doc);
    canvas.put(0, 0, 128, 255, 0, 0);
    canvas.put(0, 0, 64, 255, 0, 0);
    expect(red(doc)).toEqual(half);
    canvas.put(0, 0, 255, 255, 0, 0);
    expect(red(doc)).toEqual([255, 0, 0, 255]);
  });

  it('repaints from the pixel before the stroke when a later dab recolors it', () => {
    const { doc, canvas } = setup();
    canvas.put(0, 0, 128, 255, 0, 0);
    canvas.put(0, 0, 128, 0, 0, 255);
    expect(red(doc)).toEqual([127, 127, 255, 255]);
  });

  it('starts the next stroke fresh after finish, so a second pass builds up', () => {
    const { doc, history, change, canvas } = setup();
    canvas.put(0, 0, 128, 0, 0, 0);
    canvas.finish();
    history.commit(change);
    const next = new DabCanvas(doc, history.begin());
    next.put(0, 0, 128, 0, 0, 0);
    expect(red(doc)).toEqual([63, 63, 63, 255]);
  });

  it('ignores pixels off the canvas and zero coverage, and reports what it changed', () => {
    const { canvas } = setup();
    canvas.put(-1, 0, 255, 0, 0, 0);
    canvas.put(0, 8, 255, 0, 0, 0);
    canvas.put(3, 3, 0, 0, 0, 0);
    expect(canvas.takeChanged().width).toBe(0);
    canvas.put(2, 5, 255, 0, 0, 0);
    canvas.put(4, 1, 255, 0, 0, 0);
    expect(canvas.takeChanged()).toEqual({ x: 2, y: 1, width: 3, height: 5 });
    expect(canvas.takeChanged().width).toBe(0);
  });
});

describe('discCoverage', () => {
  it('is full inside, half on the edge, and zero outside', () => {
    expect([discCoverage(5, 3), discCoverage(5, 5), discCoverage(5, 5.6)]).toEqual([255, 128, 0]);
  });
});
