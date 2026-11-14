import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Protocol } from 'electron';
import { CONTENT_SECURITY_POLICY } from './contentSecurityPolicy.ts';

export const BUNDLE_SCHEME = 'app';
const BUNDLE_HOST = 'bundle';
export const BUNDLE_INDEX_URL = `${BUNDLE_SCHEME}://${BUNDLE_HOST}/index.html`;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

export function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Maps an app://bundle/ URL to a file inside `rootDir`. Returns null for any URL that is not
 * on the bundle host or that would resolve outside the root, so the handler answers 404.
 */
export function resolveBundleFile(requestUrl: string, rootDir: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${BUNDLE_SCHEME}:` || url.host !== BUNDLE_HOST) return null;

  let relativePath: string;
  try {
    relativePath = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (relativePath.includes('\0')) return null;
  if (relativePath === '/' || relativePath === '') relativePath = '/index.html';

  const root = path.resolve(rootDir);
  const filePath = path.resolve(root, `.${relativePath}`);
  if (!filePath.startsWith(root + path.sep)) return null;
  return filePath;
}

export function registerBundleProtocol(protocol: Protocol, rootDir: string): void {
  protocol.handle(BUNDLE_SCHEME, async (request) => {
    const filePath = resolveBundleFile(request.url, rootDir);
    if (filePath === null) return new Response(null, { status: 404 });
    try {
      const body = await readFile(filePath);
      return new Response(new Uint8Array(body), {
        headers: {
          'content-type': contentTypeFor(filePath),
          'content-security-policy': CONTENT_SECURITY_POLICY,
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}
