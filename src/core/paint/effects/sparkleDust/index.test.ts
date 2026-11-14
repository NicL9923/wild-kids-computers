import { describe, it } from 'vitest';
import { expectGolden } from '../../testing/golden.ts';
import { waveWith } from '../../testing/scenes.ts';
import sparkleDust from './index.ts';

describe('sparkleDust effect', () => {
  it('paints along a wave', () => {
    expectGolden('effect-sparkleDust', waveWith(sparkleDust).paint);
  });
});
