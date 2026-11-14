import { describe, expect, it } from 'vitest';
import { testInfoSchema } from './testInfo.ts';

function failingPaths(value: unknown): string[] {
  const result = testInfoSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.') || issue.code);
}

describe('testInfoSchema', () => {
  it('accepts every option at its limits', () => {
    expect(failingPaths({ band: 'band-9-12', seed: 0, difficulty: 1, activity: 'find-the-key' })).toEqual([]);
    expect(failingPaths({ seed: 2 ** 32 - 1, difficulty: 10 })).toEqual([]);
    expect(failingPaths({})).toEqual([]);
  });

  it.each([
    ['an unknown option', { speed: 2 }, 'unrecognized_keys'],
    ['a negative seed', { seed: -1 }, 'seed'],
    ['a seed past 32 bits', { seed: 2 ** 32 }, 'seed'],
    ['a fractional seed', { seed: 1.5 }, 'seed'],
    ['difficulty 0', { difficulty: 0 }, 'difficulty'],
    ['difficulty 11', { difficulty: 11 }, 'difficulty'],
    ['an unknown band', { band: 'band-1-2' }, 'band'],
    ['an activity route with a slash', { activity: 'a/b' }, 'activity'],
  ])('rejects %s', (_label, value, path) => {
    expect(failingPaths(value)).toEqual([path]);
  });
});
