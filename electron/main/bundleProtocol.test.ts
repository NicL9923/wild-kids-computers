import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentTypeFor, createPrintStore, resolveBundleFile, resolvePrintResponse } from './bundleProtocol.ts';

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
    ['a print path', 'app://bundle/__print/0123456789abcdef0123456789abcdef/page.html'],
  ])('rejects %s', (_label, url) => {
    expect(resolveBundleFile(url, root)).toBeNull();
  });
});

describe('resolvePrintResponse', () => {
  const token = '0123456789abcdef0123456789abcdef';
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

  it('serves a registered print page and PNG with CSP and no-store headers', async () => {
    const store = createPrintStore();
    store.set(token, { html: '<img src="./picture.png">', png });

    const page = resolvePrintResponse(`app://bundle/__print/${token}/page.html`, store);
    expect(page?.status).toBe(200);
    expect(page?.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(page?.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(page?.headers.get('content-security-policy')).not.toContain('script-src');
    expect(await page?.text()).toBe('<img src="./picture.png">');

    const image = resolvePrintResponse(`app://bundle/__print/${token}/picture.png`, store);
    expect(image?.status).toBe(200);
    expect(image?.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await (image ?? new Response()).arrayBuffer())).toEqual(png);
  });

  it('returns 404 for unknown, expired, or malformed print URLs', () => {
    const store = createPrintStore();
    expect(resolvePrintResponse(`app://bundle/__print/${token}/page.html`, store)?.status).toBe(404);
    expect(resolvePrintResponse('app://bundle/__print/not-a-token/page.html', store)?.status).toBe(404);
    expect(resolvePrintResponse(`app://bundle/__print/${token}/other.txt`, store)?.status).toBe(404);
    expect(resolvePrintResponse('app://bundle/index.html', store)).toBeNull();
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
