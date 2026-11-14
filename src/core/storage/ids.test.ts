import { describe, expect, it } from 'vitest';
import { isSafeId } from '../platform/names.ts';
import { newPictureId, newProfileId } from './ids.ts';

describe.each([
  ['newProfileId', newProfileId],
  ['newPictureId', newPictureId],
])('%s', (_name, newId) => {
  it('makes a fresh id that is safe as a document name and path segment', () => {
    const id = newId();
    expect(isSafeId(id)).toBe(true);
    expect(newId()).not.toBe(id);
  });
});
