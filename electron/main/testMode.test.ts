import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readTestMode } from './testMode.ts';

const absoluteDir = path.resolve('/tmp/wkc-e2e-1');

describe('readTestMode', () => {
  it('turns on with WKC_TEST=1 and uses the given user data directory', () => {
    expect(readTestMode({ WKC_TEST: '1', WKC_USER_DATA_DIR: absoluteDir })).toEqual({
      enabled: true,
      userDataDir: absoluteDir,
    });
  });

  it.each([
    ['WKC_TEST is unset', {}],
    ['WKC_TEST is "true"', { WKC_TEST: 'true' }],
    ['WKC_TEST is "0"', { WKC_TEST: '0' }],
  ])('stays off when %s', (_label, env) => {
    expect(readTestMode({ ...env, WKC_USER_DATA_DIR: absoluteDir })).toEqual({
      enabled: false,
      userDataDir: undefined,
    });
  });

  it('ignores a relative user data directory', () => {
    expect(readTestMode({ WKC_TEST: '1', WKC_USER_DATA_DIR: 'relative/dir' }).userDataDir).toBeUndefined();
  });
});
