import { describe, expect, it } from 'vitest';
import { cloneSurface } from '../../surface.ts';
import { expectGolden } from '../../testing/golden.ts';
import { scenePicture, sceneWith } from '../../testing/scenes.ts';
import flipSideways from './index.ts';

describe('flipSideways effect', () => {
  it('flips the scene left to right', () => {
    expectGolden('effect-flipSideways', sceneWith(flipSideways).paint);
  });

  it('gives back the original picture when flipped twice', () => {
    const flipped = sceneWith(flipSideways).paint;
    const back = cloneSurface(flipped);
    flipSideways.apply(flipped, back);
    expect(back.data).toEqual(scenePicture().data);
  });
});
