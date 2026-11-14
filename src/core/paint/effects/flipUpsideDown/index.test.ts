import { describe, expect, it } from 'vitest';
import { cloneSurface } from '../../surface.ts';
import { expectGolden } from '../../testing/golden.ts';
import { scenePicture, sceneWith } from '../../testing/scenes.ts';
import flipUpsideDown from './index.ts';

describe('flipUpsideDown effect', () => {
  it('turns the scene upside down', () => {
    expectGolden('effect-flipUpsideDown', sceneWith(flipUpsideDown).paint);
  });

  it('gives back the original picture when flipped twice', () => {
    const flipped = sceneWith(flipUpsideDown).paint;
    const back = cloneSurface(flipped);
    flipUpsideDown.apply(flipped, back);
    expect(back.data).toEqual(scenePicture().data);
  });
});
