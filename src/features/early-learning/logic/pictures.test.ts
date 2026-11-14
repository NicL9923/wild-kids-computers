import { describe, expect, it } from 'vitest';
import { ALL_PICTURES, PICTURE_SET_IDS, PICTURE_SETS } from './pictures.ts';

describe('PICTURE_SETS', () => {
  it('never repeats a picture, within a set or across sets', () => {
    expect(new Set(ALL_PICTURES).size).toBe(ALL_PICTURES.length);
  });

  it('holds enough pictures in every set for the biggest memory board', () => {
    for (const id of PICTURE_SET_IDS) expect(PICTURE_SETS[id].length, id).toBeGreaterThanOrEqual(12);
  });
});
