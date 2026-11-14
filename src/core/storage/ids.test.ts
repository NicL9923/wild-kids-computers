import { describe, expect, it } from 'vitest';
import { isSafeId } from '../platform/names.ts';
import { newProfileId } from './ids.ts';

describe('newProfileId', () => {
  it('makes a fresh id that is safe as a document name and path segment', () => {
    const id = newProfileId();
    expect(isSafeId(id)).toBe(true);
    expect(newProfileId()).not.toBe(id);
  });
});
