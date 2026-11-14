import { describe, it } from 'vitest';
import { expectGolden } from '../../testing/golden.ts';
import { sceneWith } from '../../testing/scenes.ts';
import wobbleWater from './index.ts';

describe('wobbleWater effect', () => {
  it('changes the scene', () => {
    expectGolden('effect-wobbleWater', sceneWith(wobbleWater).paint);
  });
});
