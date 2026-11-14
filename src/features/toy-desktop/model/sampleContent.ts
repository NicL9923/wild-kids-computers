/**
 * The starting files for free play. Names are short, plain, and neutral. Pictures name bundled
 * art by id; the screen maps each id in `SAMPLE_PICTURE_IDS` to an image.
 */
import { buildDesktop, note, picture, tune, type TreeSpec } from './build.ts';
import type { DesktopState } from './state.ts';

export const SAMPLE_PICTURE_IDS = ['sunflower', 'fox', 'sailboat', 'rainbow', 'butterfly', 'tractor'] as const;

const SAMPLE_FILES: TreeSpec = {
  Notes: {
    'Shopping list': note('apples\nbread\nmilk'),
    'Animal names': note('fox\nowl\nfrog'),
  },
  Pictures: {
    Sunflower: picture('sunflower'),
    Fox: picture('fox'),
    Boat: picture('sailboat'),
    Rainbow: picture('rainbow'),
  },
  Music: {
    'Up the hill': tune([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [6, 2],
    ]),
    Raindrops: tune([
      [0, 4],
      [2, 3],
      [4, 4],
      [5, 1],
      [6, 3],
    ]),
  },
  Butterfly: picture('butterfly'),
  Tractor: picture('tractor'),
};

/** The free-play desktop: the sample files and no windows open. */
export function sampleDesktop(): DesktopState {
  return buildDesktop({ files: SAMPLE_FILES });
}
