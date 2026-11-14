import { describe, expect, it } from 'vitest';
import { atan2, cos, PI, sin } from '../../math.ts';
import { createSurface } from '../../surface.ts';
import { expectGolden } from '../../testing/golden.ts';
import { isSymmetric, scenePicture, sceneWith } from '../../testing/scenes.ts';
import mirrorWheel, { foldIntoSlice } from './index.ts';

describe('mirrorWheel effect', () => {
  it('turns the scene into a kaleidoscope', () => {
    expectGolden('effect-mirrorWheel', sceneWith(mirrorWheel).paint);
  });

  it('comes out mirrored both ways, on even and odd sizes', () => {
    expect(isSymmetric(sceneWith(mirrorWheel).paint)).toEqual({ sideways: true, upDown: true });
    const odd = createSurface(7, 5);
    const source = scenePicture();
    const small = createSurface(7, 5);
    for (let y = 0; y < 5; y++) small.data.set(source.data.subarray(y * 800 + 400, y * 800 + 428), y * 28);
    mirrorWheel.apply(small, odd);
    expect(isSymmetric(odd)).toEqual({ sideways: true, upDown: true });
  });

  it.each([0, 10, 29, 31, 45, 59, 61, 89, 90, 135, 200, 300, 359])(
    'folds a point at %i degrees into the first slice without moving it closer or farther',
    (degrees) => {
      const angle = (degrees / 180) * PI;
      const out = new Float64Array(2);
      foldIntoSlice(100 * cos(angle), 100 * sin(angle), out);
      const [x = 0, y = 0] = out;
      expect(Math.sqrt(x * x + y * y)).toBeCloseTo(100, 9);
      const folded = (atan2(y, x) * 180) / PI;
      expect(folded).toBeGreaterThanOrEqual(-1e-9);
      expect(folded).toBeLessThanOrEqual(30 + 1e-9);
      // Every 30 degrees is a mirror, so the folded angle is the distance to the nearest
      // multiple of 60 degrees.
      const fromSixty = Math.abs(degrees - 60 * Math.round(degrees / 60));
      expect(folded).toBeCloseTo(fromSixty, 9);
    },
  );
});
