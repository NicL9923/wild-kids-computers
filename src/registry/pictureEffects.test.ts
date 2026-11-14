import { describe, expect, it } from 'vitest';
import { rgba, type Color } from '../core/paint/color.ts';
import { createDocument } from '../core/paint/document.ts';
import { cloneSurface, createSurface } from '../core/paint/surface.ts';
import { paintScene } from '../core/paint/testing/scenes.ts';
import type { PictureEffect } from '../core/paint/types.ts';
import { paintEffects } from './paint.ts';

/**
 * Properties every whole-picture effect shares, driven by the registry. The studio runs these
 * effects in a worker on a copy of the pixels, so each must be a pure function of its source.
 */

const pictureEffects = paintEffects.filter((effect): effect is PictureEffect => effect.group === 'whole-picture');

const SIZES = [
  [1, 1],
  [2, 3],
  [7, 5],
  [200, 125],
] as const;

const PLAIN: readonly [string, Color][] = [
  ['transparent', rgba(0, 0, 0, 0)],
  ['white paper', rgba(255, 255, 255)],
  ['one color', rgba(90, 180, 70)],
];

function isOneColor(data: Uint8ClampedArray): boolean {
  for (let i = 4; i < data.length; i++) if (data[i] !== data[i % 4]) return false;
  return true;
}

describe('whole-picture effects', () => {
  it('include the reference effect', () => {
    expect(pictureEffects.map((effect) => effect.id)).toContain('mirror');
  });

  describe.each(pictureEffects.map((effect) => [effect.id, effect] as const))('%s', (_id, effect) => {
    it('leaves its source alone and gives the same result every time', () => {
      const doc = createDocument(200, 125);
      paintScene(doc);
      const source = cloneSurface(doc.paint);
      const first = createSurface(200, 125);
      const second = createSurface(200, 125);
      effect.apply(source, first);
      effect.apply(source, second);
      expect(source.data).toEqual(doc.paint.data);
      expect(second.data).toEqual(first.data);
    });

    it.each(SIZES)('keeps a plain picture plain at %i by %i', (width, height) => {
      for (const [name, color] of PLAIN) {
        const source = createSurface(width, height, color);
        const target = createSurface(width, height, rgba(255, 0, 255));
        effect.apply(source, target);
        expect(isOneColor(target.data), name).toBe(true);
        expect(target.data[3], name).toBe(color.a);
      }
    });

    it('refuses a target of another size', () => {
      expect(() => effect.apply(createSurface(4, 4), createSurface(4, 5))).toThrow(RangeError);
      expect(() => effect.apply(createSurface(4, 4), createSurface(4, 5))).toThrow(/same size/);
    });
  });
});
