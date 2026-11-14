import { describe, it } from 'vitest';
import { expectGolden } from '../../testing/golden.ts';
import { waveWith } from '../../testing/scenes.ts';
import grassTufts from './index.ts';

describe('grassTufts effect', () => {
  it('paints along a wave', () => {
    expectGolden('effect-grassTufts', waveWith(grassTufts).paint);
  });
});
