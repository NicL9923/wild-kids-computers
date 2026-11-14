import { describe, expect, it } from 'vitest';
import { BUNDLE_INDEX_URL } from './bundleProtocol.ts';
import { resolveStartUrl } from './startUrl.ts';

describe('resolveStartUrl', () => {
  it.each(['http://localhost:5173/', 'http://127.0.0.1:5173/', 'http://[::1]:5173/'])(
    'uses the dev server at %s when unpackaged',
    (devServerUrl) => {
      expect(resolveStartUrl({ isPackaged: false, devServerUrl })).toBe(devServerUrl);
    },
  );

  it.each([
    ['the app is packaged', true, 'http://localhost:5173/'],
    ['no dev server is set', false, undefined],
    ['the URL is not parseable', false, 'localhost:5173'],
    ['the host is another machine', false, 'http://192.168.1.5:5173/'],
    ['the host only starts with localhost', false, 'http://localhost.example.com:5173/'],
    ['the scheme is not http', false, 'file:///tmp/index.html'],
  ])('loads the bundle when %s', (_label, isPackaged, devServerUrl) => {
    expect(resolveStartUrl({ isPackaged, devServerUrl })).toBe(BUNDLE_INDEX_URL);
  });
});
