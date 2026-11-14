import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentTypeFor, resolveBundleFile } from './bundleProtocol.ts';

const root = path.resolve('/opt/wkc/dist/renderer');

describe('resolveBundleFile', () => {
  it.each([
    ['the root URL to index.html', 'app://bundle/', 'index.html'],
    ['a nested asset', 'app://bundle/assets/index-abc.js', 'assets/index-abc.js'],
    ['a percent-encoded name', 'app://bundle/assets/a%20b.png', 'assets/a b.png'],
    ['a query string away', 'app://bundle/index.html?x=1#/home', 'index.html'],
    // The URL parser collapses an encoded ".." before the handler sees it, so it stays in the root.
    ['an encoded parent segment inside the root', 'app://bundle/%2e%2e/secret.txt', 'secret.txt'],
  ])('maps %s', (_label, url, expected) => {
    expect(resolveBundleFile(url, root)).toBe(path.join(root, expected));
  });

  it.each([
    ['another host', 'app://evil/index.html'],
    ['another scheme', 'file:///opt/wkc/dist/renderer/index.html'],
    ['an encoded separator escape', 'app://bundle/..%2fsecret.txt'],
    ['an encoded sibling-prefix escape', 'app://bundle/..%2frenderer-other/x.js'],
    ['malformed percent encoding', 'app://bundle/%E0%A4%A'],
    ['a NUL byte', 'app://bundle/index.html%00.png'],
    ['an unparseable URL', 'not a url'],
  ])('rejects %s', (_label, url) => {
    expect(resolveBundleFile(url, root)).toBeNull();
  });
});

describe('contentTypeFor', () => {
  it('serves module scripts as JavaScript, which Chromium requires for type=module', () => {
    expect(contentTypeFor('/x/assets/index.JS')).toBe('text/javascript; charset=utf-8');
  });

  it('falls back to a generic binary type for an unknown extension', () => {
    expect(contentTypeFor('/x/file.unknown')).toBe('application/octet-stream');
  });
});
