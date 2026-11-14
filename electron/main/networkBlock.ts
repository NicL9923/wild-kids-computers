import type { CommandLine, Session } from 'electron';

/**
 * The main-process layers of the network block in docs/architecture.md. Every layer applies at
 * once, so a request that slips past one still fails at the next.
 */

/** Where the dead proxy points. Nothing listens there, so a proxied request fails closed. */
export const DEAD_PROXY = '127.0.0.1:9';

/** Where the spellchecker would download dictionaries. The address is unroutable. */
const DEAD_DICTIONARY_URL = 'http://0.0.0.0/';

export interface NetworkPolicy {
  /** The Vite dev server, set only for an unpackaged dev run. */
  devServer: URL | undefined;
}

/**
 * Layer 1. The renderer may load its own bundle, DevTools, and blob: or data: URLs the page
 * created. An unpackaged dev run may also reach the dev server and its hot-reload socket.
 */
export function isAllowedRequestUrl(requestUrl: string, policy: NetworkPolicy): boolean {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return false;
  }
  switch (url.protocol) {
    case 'app:':
      return url.host === 'bundle';
    case 'devtools:':
    case 'data:':
      return true;
    case 'blob:':
      return isAllowedRequestUrl(url.pathname, policy) && !url.pathname.startsWith('blob:');
    case 'http:':
    case 'ws:':
      return policy.devServer !== undefined && url.host === policy.devServer.host;
    default:
      return false;
  }
}

/** Layer 2. Chromium switches. They must be appended before the ready event. */
export function applyNetworkSwitches(commandLine: Pick<CommandLine, 'appendSwitch'>, policy: NetworkPolicy): void {
  commandLine.appendSwitch('disable-background-networking');
  commandLine.appendSwitch('disable-component-update');
  commandLine.appendSwitch('no-pings');
  // No host name resolves, except the dev server's in a dev run.
  const exclude = policy.devServer === undefined ? '' : `, EXCLUDE ${policy.devServer.hostname}`;
  commandLine.appendSwitch('host-resolver-rules', `MAP * ~NOTFOUND${exclude}`);
}

/** The session settings the network block uses. `sessionControls` adapts an Electron session. */
export interface SessionControls {
  onBeforeRequest(
    listener: (details: { url: string }, callback: (response: { cancel: boolean }) => void) => void,
  ): void;
  setProxy(config: { mode: 'fixed_servers'; proxyRules: string; proxyBypassRules: string }): Promise<void>;
  forceReloadProxyConfig(): Promise<void>;
  setSpellCheckerEnabled(enabled: boolean): void;
  setSpellCheckerDictionaryDownloadURL(url: string): void;
  setPermissionRequestHandler(
    handler: (contents: unknown, permission: string, callback: (granted: boolean) => void) => void,
  ): void;
  setPermissionCheckHandler(handler: () => boolean): void;
  setDevicePermissionHandler(handler: () => boolean): void;
  setDisplayMediaRequestHandler(handler: (request: unknown, callback: (streams: null) => void) => void): void;
}

export function sessionControls(session: Session): SessionControls {
  return {
    onBeforeRequest: (listener) => session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, listener),
    setProxy: (config) => session.setProxy(config),
    forceReloadProxyConfig: () => session.forceReloadProxyConfig(),
    setSpellCheckerEnabled: (enabled) => session.setSpellCheckerEnabled(enabled),
    setSpellCheckerDictionaryDownloadURL: (url) => session.setSpellCheckerDictionaryDownloadURL(url),
    setPermissionRequestHandler: (handler) => session.setPermissionRequestHandler(handler),
    setPermissionCheckHandler: (handler) => session.setPermissionCheckHandler(handler),
    setDevicePermissionHandler: (handler) => session.setDevicePermissionHandler(handler),
    setDisplayMediaRequestHandler: (handler) => session.setDisplayMediaRequestHandler(handler),
  };
}

/** Layers 1, 3, 4, and 7 on the session the window uses. */
export async function hardenSession(session: SessionControls, policy: NetworkPolicy): Promise<void> {
  session.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowedRequestUrl(details.url, policy) });
  });

  // Layer 3. `<-loopback>` removes Chromium's implicit loopback bypass, so a request to this
  // machine also goes to the dead proxy. A dev run bypasses it for the dev server only.
  const bypass = policy.devServer === undefined ? '<-loopback>' : `<-loopback>;${policy.devServer.host}`;
  await session.setProxy({ mode: 'fixed_servers', proxyRules: DEAD_PROXY, proxyBypassRules: bypass });
  // The first lookup after setProxy can still report DIRECT, although real requests already use
  // the proxy. A reload makes resolveProxy match what requests do.
  await session.forceReloadProxyConfig();

  // Layer 4.
  session.setSpellCheckerEnabled(false);
  session.setSpellCheckerDictionaryDownloadURL(DEAD_DICTIONARY_URL);

  // Layer 7.
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  session.setDevicePermissionHandler(() => false);
  session.setDisplayMediaRequestHandler((_request, callback) => callback(null));
}
