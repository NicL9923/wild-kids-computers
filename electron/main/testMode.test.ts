import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readTestMode } from './testMode.ts';

const absoluteDir = path.resolve('/tmp/wkc-e2e-1');

describe('readTestMode', () => {
  it('turns on with WKC_TEST=1 and reads the user data directory and test info', () => {
    const info = { band: 'band-6-8', seed: 7, difficulty: 3, activity: 'find-the-key' };
    expect(
      readTestMode({ WKC_TEST: '1', WKC_USER_DATA_DIR: absoluteDir, WKC_TEST_INFO: JSON.stringify(info) }),
    ).toEqual({ enabled: true, userDataDir: absoluteDir, info });
  });

  it('gives an empty test info object when a test passes none', () => {
    expect(readTestMode({ WKC_TEST: '1' }).info).toEqual({});
  });

  it.each([
    ['WKC_TEST is unset', {}],
    ['WKC_TEST is "true"', { WKC_TEST: 'true' }],
    ['WKC_TEST is "0"', { WKC_TEST: '0' }],
  ])('stays off and ignores the other variables when %s', (_label, env) => {
    expect(readTestMode({ ...env, WKC_USER_DATA_DIR: absoluteDir, WKC_TEST_INFO: '{"seed":1}' })).toEqual({
      enabled: false,
      userDataDir: undefined,
      info: undefined,
    });
  });

  it('ignores a relative user data directory', () => {
    expect(readTestMode({ WKC_TEST: '1', WKC_USER_DATA_DIR: 'relative/dir' }).userDataDir).toBeUndefined();
  });

  it.each([
    ['malformed JSON', '{seed:1}', SyntaxError],
    ['an unknown option', '{"speed":1}', /speed/],
    ['a seed out of range', '{"seed":-1}', /seed/],
  ])('fails at launch on %s', (_label, raw, error) => {
    expect(() => readTestMode({ WKC_TEST: '1', WKC_TEST_INFO: raw })).toThrow(error);
  });
});
