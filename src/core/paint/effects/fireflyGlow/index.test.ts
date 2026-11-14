import { describe, it } from 'vitest';
import { rgba } from '../../color.ts';
import { expectGolden } from '../../testing/golden.ts';
import { waveWith } from '../../testing/scenes.ts';
import fireflyGlow from './index.ts';

/** Fireflies glow best at night, which is where a child sees what this effect does. */
const NIGHT = rgba(25, 30, 70);

describe('fireflyGlow effect', () => {
  it('paints along a wave', () => {
    expectGolden('effect-fireflyGlow', waveWith(fireflyGlow, { background: NIGHT }).paint);
  });
});
