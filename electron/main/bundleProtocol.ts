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

export const PRINT_PATH_PREFIX = '/__print/';

/** Print pages contain only static markup and an <img>; block all scripts via default-src 'none'. */
const PRINT_CONTENT_SECURITY_POLICY =
  "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export interface PrintPayload {
  readonly html: string;
  readonly png: Uint8Array;
}

export type PrintStore = Map<string, PrintPayload>;

export function createPrintStore(): PrintStore {
  return new Map();
}

/**
 * Serves a one-time print page or its PNG from memory under app://bundle/__print/<token>/,
 * keeping print windows under the app's strict CSP without data URLs or executeJavaScript.
 */
export function resolvePrintResponse(
  requestUrl: string,
  printStore: ReadonlyMap<string, PrintPayload>,
): Response | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${BUNDLE_SCHEME}:` || url.host !== BUNDLE_HOST) return null;
  if (!url.pathname.startsWith(PRINT_PATH_PREFIX)) return null;
  const match = /^\/__print\/([a-f0-9]{32})\/(page\.html|picture\.png)$/.exec(url.pathname);
  if (match === null) return new Response(null, { status: 404 });
  const [, token = '', asset = ''] = match;
  const payload = printStore.get(token);
  if (payload === undefined) return new Response(null, { status: 404 });
  if (asset === 'page.html') {
    return new Response(payload.html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': PRINT_CONTENT_SECURITY_POLICY,
        'cache-control': 'no-store',
      },
    });
  }
  return new Response(new Uint8Array(payload.png), {
    headers: {
      'content-type': 'image/png',
      'content-security-policy': PRINT_CONTENT_SECURITY_POLICY,
      'cache-control': 'no-store',
    },
  });
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
  if (relativePath.startsWith(PRINT_PATH_PREFIX)) return null;
  if (relativePath === '/' || relativePath === '') relativePath = '/index.html';

  const root = path.resolve(rootDir);
  const filePath = path.resolve(root, `.${relativePath}`);
  if (!filePath.startsWith(root + path.sep)) return null;
  return filePath;
}

export function registerBundleProtocol(
  protocol: Protocol,
  rootDir: string,
  printStore: ReadonlyMap<string, PrintPayload> = new Map(),
): void {
  protocol.handle(BUNDLE_SCHEME, async (request) => {
    const printResponse = resolvePrintResponse(request.url, printStore);
    if (printResponse !== null) return printResponse;
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
