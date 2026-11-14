import { describe, expect, it } from 'vitest';
import { createRandom } from '../random.ts';
import { expectNoPositionTell } from './positionTell.ts';

const SEEDS = Array.from({ length: 600 }, (_, index) => index * 2_053 + 7);

describe('expectNoPositionTell', () => {
  it('passes items laid out in any order at all', () => {
    expectNoPositionTell(SEEDS, (seed) => ({ positions: createRandom(seed).shuffle([0, 1, 2]) }));
  });

  it.each([
    ['two items always crossed', () => [1, 0], 'item 0 went to place 0 0 of 600 times'],
    [
      'three items never straight down',
      (seed: number) => (seed % 2 === 0 ? [1, 2, 0] : [2, 0, 1]),
      'item 0 went to place 0 0 of 600 times',
    ],
    ['an answer that is never last', (seed: number) => [seed % 2], 'item 0 went to place 2 0 of 600 times'],
  ])('fails %s', (_name, positions, tell) => {
    expect(() =>
      expectNoPositionTell(SEEDS, (seed) => ({
        positions: positions(seed),
        slots: positions(seed).length === 1 ? 3 : undefined,
      })),
    ).toThrow(tell);
  });

  it('refuses an answer outside the places', () => {
    expect(() => expectNoPositionTell([1], () => ({ positions: [2], slots: 2 }))).toThrow(
      'Seed 1 put an answer outside 0 to 1: 2',
    );
  });
});
