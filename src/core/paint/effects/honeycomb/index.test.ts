import { describe, expect, it } from 'vitest';
import { expectGolden } from '../../testing/golden.ts';
import { waveWith } from '../../testing/scenes.ts';
import honeycomb, { locateHoneyCell } from './index.ts';

function honeyCell(x: number, y: number, radius: number): { column: number; row: number; depth: number } {
  const out = new Float64Array(3);
  locateHoneyCell(x, y, radius, out);
  return { column: out[0] ?? 0, row: out[1] ?? 0, depth: out[2] ?? 0 };
}

describe('honeycomb effect', () => {
  it('reveals a honeycomb along a wave', () => {
    expectGolden('effect-honeycomb', waveWith(honeycomb).paint);
  });

  it('is fixed to the paper, so strokes with different seeds join without seams', () => {
    expect(waveWith(honeycomb, { seed: 8 }).paint.data).toEqual(waveWith(honeycomb, { seed: 7 }).paint.data);
  });

  it('finds the cell a point is in: depth 0 at each center, never past the wall', () => {
    const radius = 10;
    const across = Math.sqrt(3) * radius;
    expect(honeyCell(0, 0, radius)).toEqual({ column: 0, row: 0, depth: 0 });
    expect(honeyCell(across / 2, 15, radius)).toEqual({ column: 1, row: 1, depth: 0 });
    expect(honeyCell(across, 0, radius)).toEqual({ column: 2, row: 0, depth: 0 });
    let deepest = 0;
    for (let y = -40; y <= 40; y += 0.7) {
      for (let x = -40; x <= 40; x += 0.7) deepest = Math.max(deepest, honeyCell(x, y, radius).depth);
    }
    expect(deepest).toBeLessThanOrEqual(1 + 1e-9);
    expect(deepest).toBeGreaterThan(0.97);
    // A point on the flat wall between two side-by-side cells is at depth 1 from both.
    expect(honeyCell(across / 2, 0, radius).depth).toBeCloseTo(1, 12);
  });
});
