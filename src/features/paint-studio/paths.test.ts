import { describe, expect, it } from 'vitest';
import { parseStudioSearch } from './paths.ts';

describe('studio search parameters', () => {
  it('keeps a picture id', () => {
    expect(parseStudioSearch({ picture: 'pic-1' })).toEqual({ picture: 'pic-1' });
  });

  it.each([
    ['an id that could leave the gallery folder', { picture: '../settings' }],
    ['a number', { picture: 7 }],
    ['nothing', {}],
  ])('drops %s instead of throwing', (_label, search) => {
    expect(parseStudioSearch(search)).toEqual({});
  });
});
