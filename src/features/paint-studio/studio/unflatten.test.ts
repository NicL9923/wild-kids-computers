import { describe, expect, it } from 'vitest';
import { rgba } from '../../../core/paint/color.ts';
import { createDocument, flattenDocument } from '../../../core/paint/document.ts';
import { createSurface } from '../../../core/paint/surface.ts';
import { unflattenUnderMask } from './unflatten.ts';

describe('unflattenUnderMask', () => {
  it('recovers paint under see-through line edges, paper under solid lines, and leaves the rest', () => {
    const doc = createDocument(4, 1);
    const paint = [rgba(200, 40, 40), rgba(30, 160, 90), rgba(10, 20, 250), rgba(120, 120, 0)];
    paint.forEach((color, x) => doc.paint.data.set([color.r, color.g, color.b, 255], x * 4));
    const mask = createSurface(4, 1);
    // No line, a faint edge, a half edge, a solid line.
    mask.data.set([0, 0, 0, 0, 0, 0, 0, 40, 0, 0, 0, 128, 0, 0, 0, 255]);
    doc.mask = mask;

    const recovered = unflattenUnderMask(flattenDocument(doc), mask).data;
    expect([...recovered.subarray(0, 4)]).toEqual([200, 40, 40, 255]);
    // Reversing an 8-bit blend is exact to within one level per channel.
    for (const x of [1, 2]) {
      const color = paint[x] ?? rgba(0, 0, 0);
      const i = x * 4;
      expect(Math.abs((recovered[i] ?? 0) - color.r)).toBeLessThanOrEqual(2);
      expect(Math.abs((recovered[i + 1] ?? 0) - color.g)).toBeLessThanOrEqual(2);
      expect(Math.abs((recovered[i + 2] ?? 0) - color.b)).toBeLessThanOrEqual(2);
    }
    expect([...recovered.subarray(12, 16)]).toEqual([255, 255, 255, 255]);
  });

  it('refuses a mask of another size', () => {
    expect(() => unflattenUnderMask(createSurface(4, 2), createSurface(4, 1))).toThrow('4 by 2');
  });

  it('reverses the blend of colored lines, and treats the hidden threshold as hidden', () => {
    const doc = createDocument(2, 1);
    doc.paint.data.set([200, 150, 100, 255, 200, 150, 100, 255]);
    const mask = createSurface(2, 1);
    mask.data.set([20, 40, 160, 100, 20, 40, 160, 250]);
    doc.mask = mask;
    const recovered = unflattenUnderMask(flattenDocument(doc), mask).data;
    for (const [c, expected] of [200, 150, 100].entries()) {
      expect(Math.abs((recovered[c] ?? 0) - expected), `channel ${c}`).toBeLessThanOrEqual(2);
    }
    expect([...recovered.subarray(4, 8)]).toEqual([255, 255, 255, 255]);
  });

  it('refuses a mask of another width', () => {
    expect(() => unflattenUnderMask(createSurface(5, 1), createSurface(4, 1))).toThrow('5 by 1');
  });
});
