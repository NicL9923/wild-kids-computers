import { describe, expect, it } from 'vitest';
import { HOME_PLACE_IDS } from '../components/ui/homePlaces.ts';
import {
  CLOSING_PATH,
  HOME_PATH,
  isOpenAfterSessionLimit,
  PARENT_CORNER_PATH,
  placePath,
  START_PATH,
} from './paths.ts';

describe('home map places', () => {
  it('send the paint studio to /paint and every other place to its area screen', () => {
    expect(Object.fromEntries(HOME_PLACE_IDS.map((id) => [id, placePath(id)]))).toEqual({
      'paint-studio': '/paint',
      'early-learning': '/area/early-learning',
      'toy-desktop': '/area/toy-desktop',
      'computer-skills': '/area/computer-skills',
      'robot-painter': '/area/robot-painter',
    });
  });
});

describe('screens after the session limit', () => {
  it.each([
    [CLOSING_PATH, true],
    [PARENT_CORNER_PATH, true],
    [HOME_PATH, false],
    [START_PATH, false],
    ['/paint', false],
    ['/activity/pop-the-seed-pods', false],
  ])('%s open: %s', (path, open) => {
    expect(isOpenAfterSessionLimit(path)).toBe(open);
  });
});
