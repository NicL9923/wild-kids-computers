import { describe, it } from 'vitest';
import { expectGolden } from '../../testing/golden.ts';
import { waveWith } from '../../testing/scenes.ts';
import iceCrystals from './index.ts';

describe('iceCrystals effect', () => {
  it('paints along a wave', () => {
    expectGolden('effect-iceCrystals', waveWith(iceCrystals).paint);
  });
});
