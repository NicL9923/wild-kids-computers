import type { Surface } from './surface.ts';
import type { PictureEffect } from './types.ts';

/**
 * Whole-picture effects that move pixels around, such as mirror or kaleidoscope, are a sample
 * map: for each target pixel, the index of the source pixel it copies. Building the map does
 * the geometry once per picture size. Applying it costs one lookup and one copy per pixel.
 */

/** Returns the source pixel index for target pixel (x, y), or -1 to keep the source pixel. */
export type SampleMapper = (x: number, y: number, width: number, height: number) => number;

export function buildSampleMap(width: number, height: number, mapper: SampleMapper): Int32Array {
  const map = new Int32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const source = mapper(x, y, width, height);
      map[p] = source < 0 || source >= width * height ? p : source;
    }
  }
  return map;
}

export function applySampleMap(map: Int32Array, source: Surface, target: Surface): void {
  if (source.width !== target.width || source.height !== target.height || map.length !== source.width * source.height) {
    throw new RangeError('Source, target, and sample map must all be the same size.');
  }
  const from = new Uint32Array(source.data.buffer, source.data.byteOffset, map.length);
  const to = new Uint32Array(target.data.buffer, target.data.byteOffset, map.length);
  for (let p = 0; p < map.length; p++) to[p] = from[map[p] ?? p] ?? 0;
}

/** A whole-picture effect from a mapper, with its map cached per picture size. */
export function sampleMapEffect(id: string, order: number, mapper: SampleMapper): PictureEffect {
  return builtMapEffect(id, order, (width, height) => buildSampleMap(width, height, mapper));
}

/**
 * A whole-picture effect whose map is built by a function of the picture size, cached per size.
 * For a map that a tight loop builds faster than a mapper called once per pixel can, such as one
 * that works a row at a time. Every entry must be a pixel index on a picture of that size.
 */
export function builtMapEffect(
  id: string,
  order: number,
  build: (width: number, height: number) => Int32Array,
): PictureEffect {
  const cache = new Map<string, Int32Array>();
  return {
    id,
    order,
    group: 'whole-picture',
    apply(source, target) {
      const key = `${source.width}x${source.height}`;
      let map = cache.get(key);
      if (map === undefined) {
        map = build(source.width, source.height);
        cache.set(key, map);
      }
      applySampleMap(map, source, target);
    },
  };
}
