import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readTestMode, stripDebugSwitches } from './testMode.ts';

const absoluteDir = path.resolve('/tmp/wkc-e2e-1');

describe('readTestMode', () => {
  it('turns on with WKC_TEST=1 and reads the user data directory and test info', () => {
    const info = { band: 'band-6-8', seed: 7, difficulty: 3, activity: 'find-the-key' };
    expect(
      readTestMode({ WKC_TEST: '1', WKC_USER_DATA_DIR: absoluteDir, WKC_TEST_INFO: JSON.stringify(info) }, false),
    ).toEqual({ enabled: true, userDataDir: absoluteDir, info });
  });

  it('gives an empty test info object when a test passes none', () => {
    expect(readTestMode({ WKC_TEST: '1' }, false).info).toEqual({});
  });

  it.each([
    ['WKC_TEST is unset', {}],
    ['WKC_TEST is "true"', { WKC_TEST: 'true' }],
    ['WKC_TEST is "0"', { WKC_TEST: '0' }],
  ])('stays off and ignores the other variables when %s', (_label, env) => {
    expect(readTestMode({ ...env, WKC_USER_DATA_DIR: absoluteDir, WKC_TEST_INFO: '{"seed":1}' }, false)).toEqual({
      enabled: false,
      userDataDir: undefined,
      info: undefined,
    });
  });

  it('stays off in the packaged app, whatever the environment says', () => {
    const env = { WKC_TEST: '1', WKC_USER_DATA_DIR: absoluteDir, WKC_TEST_INFO: '{"seed":1}' };
    expect(readTestMode(env, true)).toEqual({ enabled: false, userDataDir: undefined, info: undefined });
  });

  it('ignores a relative user data directory', () => {
    expect(readTestMode({ WKC_TEST: '1', WKC_USER_DATA_DIR: 'relative/dir' }, false).userDataDir).toBeUndefined();
  });

  it.each([
    ['malformed JSON', '{seed:1}', SyntaxError],
    ['an unknown option', '{"speed":1}', /speed/],
    ['a seed out of range', '{"seed":-1}', /seed/],
  ])('fails at launch on %s', (_label, raw, error) => {
    expect(() => readTestMode({ WKC_TEST: '1', WKC_TEST_INFO: raw }, false)).toThrow(error);
  });
});

/** A command line, the I/O edge: it records what was removed. */
function commandLine(switches: string[]) {
  const present = new Set(switches);
  return {
    hasSwitch: (name: string) => present.has(name),
    removeSwitch: (name: string) => {
      if (!present.delete(name)) throw new Error(`Removed ${name}, which was not there.`);
    },
    present,
  };
}

describe('stripDebugSwitches', () => {
  it('removes every debugging switch from the packaged app and keeps the rest', () => {
    const line = commandLine(['remote-debugging-port', 'remote-debugging-pipe', 'lang']);
    expect(stripDebugSwitches(line, true)).toEqual(['remote-debugging-port', 'remote-debugging-pipe']);
    expect([...line.present]).toEqual(['lang']);
  });

  it('leaves an unpackaged run alone, so Playwright can drive it', () => {
    const line = commandLine(['remote-debugging-port']);
    expect(stripDebugSwitches(line, false)).toEqual([]);
    expect([...line.present]).toEqual(['remote-debugging-port']);
  });
});
