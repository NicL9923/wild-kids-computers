import { describe, it } from 'vitest';
import { expectGolden } from '../../testing/golden.ts';
import { waveWith } from '../../testing/scenes.ts';
import autumnLeaves from './index.ts';

describe('autumnLeaves effect', () => {
  it('paints along a wave', () => {
    expectGolden('effect-autumnLeaves', waveWith(autumnLeaves).paint);
  });
});
