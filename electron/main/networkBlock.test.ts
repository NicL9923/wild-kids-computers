import { describe, expect, it } from 'vitest';
import {
  applyNetworkSwitches,
  DEAD_PROXY,
  hardenSession,
  isAllowedRequestUrl,
  type NetworkPolicy,
  type SessionControls,
} from './networkBlock.ts';

const packaged: NetworkPolicy = { devServer: undefined };
const dev: NetworkPolicy = { devServer: new URL('http://127.0.0.1:5173/') };

describe('isAllowedRequestUrl', () => {
  it.each([
    ['the bundle', 'app://bundle/assets/index.js', packaged],
    ['DevTools', 'devtools://devtools/bundled/inspector.html', packaged],
    ['a data URL', 'data:image/png;base64,AAAA', packaged],
    ['a blob the bundle made', 'blob:app://bundle/0f8fad5b-d9cb-469f-a165-70867728950e', packaged],
    ['the dev server in a dev run', 'http://127.0.0.1:5173/src/main.tsx', dev],
    ['the hot-reload socket in a dev run', 'ws://127.0.0.1:5173/', dev],
    ['a blob the dev page made', 'blob:http://127.0.0.1:5173/0f8f', dev],
  ])('allows %s', (_label, url, policy) => {
    expect(isAllowedRequestUrl(url, policy)).toBe(true);
  });

  it.each([
    ['another app:// host', 'app://evil/index.html', packaged],
    ['an outside site', 'https://example.com/', packaged],
    ['the dev server port in a packaged run', 'http://127.0.0.1:5173/', packaged],
    ['another port in a dev run', 'http://127.0.0.1:5174/', dev],
    ['another host on the dev port', 'http://localhost:5173/', dev],
    ['https to the dev server', 'https://127.0.0.1:5173/', dev],
    ['a local file', 'file:///etc/passwd', packaged],
    ['a blob from another origin', 'blob:https://example.com/0f8f', packaged],
    ['a nested blob', 'blob:blob:app://bundle/0f8f', packaged],
    ['a blob with an opaque origin', 'blob:null/0f8f', packaged],
    ['an FTP URL', 'ftp://example.com/', packaged],
    ['a chrome URL', 'chrome://gpu', packaged],
    ['an unparseable URL', 'not a url', packaged],
  ])('cancels %s', (_label, url, policy) => {
    expect(isAllowedRequestUrl(url, policy)).toBe(false);
  });
});

function switchesFor(policy: NetworkPolicy): Record<string, string | undefined> {
  const switches: Record<string, string | undefined> = {};
  applyNetworkSwitches({ appendSwitch: (name, value) => void (switches[name] = value) }, policy);
  return switches;
}

describe('applyNetworkSwitches', () => {
  it('turns off background networking and resolves no host name', () => {
    expect(switchesFor(packaged)).toEqual({
      'disable-background-networking': undefined,
      'disable-component-update': undefined,
      'no-pings': undefined,
      'host-resolver-rules': 'MAP * ~NOTFOUND',
    });
  });

  it('lets a dev run resolve only the dev server host', () => {
    expect(switchesFor({ devServer: new URL('http://localhost:5173/') })['host-resolver-rules']).toBe(
      'MAP * ~NOTFOUND, EXCLUDE localhost',
    );
  });
});

type Recorded = { [K in keyof SessionControls]?: Parameters<SessionControls[K]> };

/** Records the arguments of every setting hardenSession applies. */
function fakeSession() {
  const calls: Recorded = {};
  const session: SessionControls = {
    onBeforeRequest: (...args) => void (calls.onBeforeRequest = args),
    setProxy: async (...args) => void (calls.setProxy = args),
    forceReloadProxyConfig: async () => void (calls.forceReloadProxyConfig = []),
    setSpellCheckerEnabled: (...args) => void (calls.setSpellCheckerEnabled = args),
    setSpellCheckerDictionaryDownloadURL: (...args) => void (calls.setSpellCheckerDictionaryDownloadURL = args),
    setPermissionRequestHandler: (...args) => void (calls.setPermissionRequestHandler = args),
    setPermissionCheckHandler: (...args) => void (calls.setPermissionCheckHandler = args),
    setDevicePermissionHandler: (...args) => void (calls.setDevicePermissionHandler = args),
    setDisplayMediaRequestHandler: (...args) => void (calls.setDisplayMediaRequestHandler = args),
  };
  return { session, calls };
}

function registered<T>(handler: T | undefined): T {
  if (handler === undefined) throw new Error('No handler was registered.');
  return handler;
}

describe('hardenSession', () => {
  it('cancels a request through the filter and lets a bundle request through', async () => {
    const { session, calls } = fakeSession();
    await hardenSession(session, packaged);
    const [filter] = registered(calls.onBeforeRequest);
    const decisions: boolean[] = [];
    filter({ url: 'https://example.com/' }, ({ cancel }) => decisions.push(cancel));
    filter({ url: 'app://bundle/index.html' }, ({ cancel }) => decisions.push(cancel));
    expect(decisions).toEqual([true, false]);
  });

  it('sends every address, loopback included, to the dead proxy, then reloads the proxy config', async () => {
    const { session, calls } = fakeSession();
    await hardenSession(session, packaged);
    expect(calls.setProxy).toEqual([
      { mode: 'fixed_servers', proxyRules: DEAD_PROXY, proxyBypassRules: '<-loopback>' },
    ]);
    expect(calls.forceReloadProxyConfig).toEqual([]);
  });

  it('bypasses the proxy for the dev server only in a dev run', async () => {
    const { session, calls } = fakeSession();
    await hardenSession(session, dev);
    expect(calls.setProxy).toEqual([
      { mode: 'fixed_servers', proxyRules: DEAD_PROXY, proxyBypassRules: '<-loopback>;127.0.0.1:5173' },
    ]);
  });

  it('turns the spellchecker off and points its download nowhere', async () => {
    const { session, calls } = fakeSession();
    await hardenSession(session, packaged);
    expect(calls.setSpellCheckerEnabled).toEqual([false]);
    expect(calls.setSpellCheckerDictionaryDownloadURL).toEqual(['http://0.0.0.0/']);
  });

  it('denies every permission request, check, device, and screen capture', async () => {
    const { session, calls } = fakeSession();
    await hardenSession(session, packaged);
    const granted: boolean[] = [];
    registered(calls.setPermissionRequestHandler)[0](null, 'media', (value) => granted.push(value));
    expect(granted).toEqual([false]);
    expect(registered(calls.setPermissionCheckHandler)[0]()).toBe(false);
    expect(registered(calls.setDevicePermissionHandler)[0]()).toBe(false);
    const streams: unknown[] = [];
    registered(calls.setDisplayMediaRequestHandler)[0]({}, (value) => streams.push(value));
    expect(streams).toEqual([null]);
  });
});
