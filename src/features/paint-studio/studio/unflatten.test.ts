import { describe, expect, it } from 'vitest';
import { rgba } from '../../../core/paint/color.ts';
import { createDocument, flattenDocument } from '../../../core/paint/document.ts';
import { createSurface } from '../../../core/paint/surface.ts';
import { unflattenUnderMask } from './unflatten.ts';

describe('unflattenUnderMask', () => {
  it('recovers paint under see-through line edges, dilates into adjacent solid lines, and falls back to paper', () => {
    const doc = createDocument(5, 1);
    const paint = [rgba(200, 40, 40), rgba(30, 160, 90), rgba(10, 20, 250), rgba(120, 120, 0), rgba(80, 90, 100)];
    paint.forEach((color, x) => doc.paint.data.set([color.r, color.g, color.b, 255], x * 4));
    const mask = createSurface(5, 1);
    // No line, a faint edge, a half edge, a solid line next to recovered paint, an interior solid line.
    mask.data.set([0, 0, 0, 0, 0, 0, 0, 40, 0, 0, 0, 128, 0, 0, 0, 255, 0, 0, 0, 255]);
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
    // Pixel 3 borders recovered pixel 2, so it inherits pixel 2's color to prevent white fringes.
    expect(Math.abs((recovered[12] ?? 0) - 10)).toBeLessThanOrEqual(2);
    expect(Math.abs((recovered[13] ?? 0) - 20)).toBeLessThanOrEqual(2);
    expect(Math.abs((recovered[14] ?? 0) - 250)).toBeLessThanOrEqual(2);
    // Pixel 4 has no recovered neighbor, so it falls back to paper.
    expect([...recovered.subarray(16, 20)]).toEqual([255, 255, 255, 255]);
  });

  it('refuses a mask of another size', () => {
    expect(() => unflattenUnderMask(createSurface(4, 2), createSurface(4, 1))).toThrow('4 by 2');
  });

  it('reverses the blend of colored lines, and treats high alpha (>= 220) as hidden', () => {
    const doc = createDocument(3, 1);
    doc.paint.data.set([200, 150, 100, 255, 20, 20, 20, 255, 20, 20, 20, 255]);
    const mask = createSurface(3, 1);
    mask.data.set([20, 40, 160, 100, 20, 40, 160, 220, 20, 40, 160, 255]);
    doc.mask = mask;
    const recovered = unflattenUnderMask(flattenDocument(doc), mask).data;
    for (const [c, expected] of [200, 150, 100].entries()) {
      expect(Math.abs((recovered[c] ?? 0) - expected), `channel ${c}`).toBeLessThanOrEqual(2);
    }
    // Pixel 1 (alpha 220) is treated as hidden and dilated from pixel 0 instead of noisy unmixing.
    for (const [c, expected] of [200, 150, 100].entries()) {
      expect(Math.abs((recovered[4 + c] ?? 0) - expected), `dilated channel ${c}`).toBeLessThanOrEqual(2);
    }
    // Pixel 2 has only hidden neighbors, so it becomes paper.
    expect([...recovered.subarray(8, 12)]).toEqual([255, 255, 255, 255]);
  });

  it('refuses a mask of another width', () => {
    expect(() => unflattenUnderMask(createSurface(5, 1), createSurface(4, 1))).toThrow('5 by 1');
  });
});
