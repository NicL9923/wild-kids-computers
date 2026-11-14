import { describe, it } from 'vitest';
import { expectGolden } from '../../testing/golden.ts';
import { waveWith } from '../../testing/scenes.ts';
import petalShower from './index.ts';

describe('petalShower effect', () => {
  it('paints along a wave', () => {
    expectGolden('effect-petalShower', waveWith(petalShower).paint);
  });
});
