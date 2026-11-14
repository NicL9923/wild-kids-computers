/**
 * A small seeded random generator (mulberry32). Effects that scatter things take a seed and
 * draw from this, never from Math.random, so a stroke paints the same pixels every time.
 */
export interface Random {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [0, n). */
  int(n: number): number;
  /** A float in [low, high). */
  range(low: number, high: number): number;
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    range: (low, high) => low + (high - low) * next(),
  };
}

/** Mixes integers into one 32-bit seed, so a dab's randomness depends only on the stroke seed and its index. */
export function mixSeed(...parts: readonly number[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    h = Math.imul(h ^ (part >>> 0), 0x01000193);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/** A deterministic value in [0, 1) for an integer position, for paper grain and similar textures. */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth noise in [0, 1): hash values on a grid `cell` pixels apart, blended between grid points. */
export function valueNoise(x: number, y: number, cell: number, seed: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = (x - gx * cell) / cell;
  const fy = (y - gy * cell) / cell;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = hash2(gx, gy, seed) + (hash2(gx + 1, gy, seed) - hash2(gx, gy, seed)) * sx;
  const bottom = hash2(gx, gy + 1, seed) + (hash2(gx + 1, gy + 1, seed) - hash2(gx, gy + 1, seed)) * sx;
  return top + (bottom - top) * sy;
}
