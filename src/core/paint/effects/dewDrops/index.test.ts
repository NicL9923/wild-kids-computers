import { describe, it } from 'vitest';
import { expectGolden } from '../../testing/golden.ts';
import { waveWith } from '../../testing/scenes.ts';
import dewDrops from './index.ts';

describe('dewDrops effect', () => {
  it('paints along a wave', () => {
    expectGolden('effect-dewDrops', waveWith(dewDrops).paint);
  });
});
