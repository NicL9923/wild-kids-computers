import { describe, expect, it } from 'vitest';
import { applySampleMap, buildSampleMap, sampleMapEffect } from './sampleMap.ts';
import { createSurface, surfaceFromData } from './surface.ts';

describe('sample maps', () => {
  it('copies each target pixel from the source pixel the mapper names, and keeps it for -1 or out of range', () => {
    const map = buildSampleMap(3, 1, (x) => [2, -1, 99][x] ?? 0);
    expect([...map]).toEqual([2, 1, 2]);
    const source = surfaceFromData(3, 1, new Uint8Array([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]));
    const target = createSurface(3, 1);
    applySampleMap(map, source, target);
    expect([...target.data]).toEqual([3, 3, 3, 3, 2, 2, 2, 2, 3, 3, 3, 3]);
  });

  it('refuses surfaces or a map of different sizes', () => {
    const map = buildSampleMap(2, 2, () => -1);
    expect(() => applySampleMap(map, createSurface(2, 2), createSurface(2, 3))).toThrow('must all be the same size');
    expect(() => applySampleMap(map, createSurface(3, 2), createSurface(3, 2))).toThrow('must all be the same size');
  });

  it('builds the map once per picture size', () => {
    let calls = 0;
    const effect = sampleMapEffect('probe', 1, () => {
      calls += 1;
      return -1;
    });
    effect.apply(createSurface(2, 2), createSurface(2, 2));
    effect.apply(createSurface(2, 2), createSurface(2, 2));
    expect(calls).toBe(4);
    effect.apply(createSurface(3, 1), createSurface(3, 1));
    expect(calls).toBe(7);
  });
});
