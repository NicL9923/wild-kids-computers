import { isSafeId } from '../../src/core/platform/names.ts';
import { BUNDLE_INDEX_URL } from './bundleProtocol.ts';

const DEV_SERVER_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The page the window loads. The Vite dev server is honored only when the app is unpackaged
 * and the URL points at this machine. Anything else falls back to the bundled renderer. A test
 * that names an activity starts on that activity's route.
 */
export function resolveStartUrl(options: {
  isPackaged: boolean;
  devServerUrl: string | undefined;
  activity?: string | undefined;
}): string {
  const base = baseUrl(options);
  return options.activity !== undefined && isSafeId(options.activity) ? `${base}#/activity/${options.activity}` : base;
}

function baseUrl(options: { isPackaged: boolean; devServerUrl: string | undefined }): string {
  if (options.isPackaged || options.devServerUrl === undefined) return BUNDLE_INDEX_URL;
  let url: URL;
  try {
    url = new URL(options.devServerUrl);
  } catch {
    return BUNDLE_INDEX_URL;
  }
  if (url.protocol !== 'http:' || !DEV_SERVER_HOSTS.has(url.hostname)) return BUNDLE_INDEX_URL;
  return url.href;
}
