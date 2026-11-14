import { describe, it } from 'vitest';
import { expectGolden } from '../../testing/golden.ts';
import { waveWith } from '../../testing/scenes.ts';
import soapBubbles from './index.ts';

describe('soapBubbles effect', () => {
  it('paints along a wave', () => {
    expectGolden('effect-soapBubbles', waveWith(soapBubbles).paint);
  });
});
