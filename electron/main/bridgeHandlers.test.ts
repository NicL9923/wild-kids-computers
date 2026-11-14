import { describe, expect, it, vi } from 'vitest';
import { BridgeError } from '../../src/core/platform/bridge.ts';
import { handleBridgeCall, isTrustedSender, originOf, type BridgeImplementation } from './bridgeHandlers.ts';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Every method fails the test unless the test replaced it. */
function fakeBridge(): { bridge: BridgeImplementation; calls: string[] } {
  const calls: string[] = [];
  const unexpected = (name: string) => async () => {
    calls.push(name);
    throw new Error(`unexpected call to ${name}`);
  };
  const bridge: BridgeImplementation = {
    info: unexpected('info'),
    documents: {
      read: unexpected('documents.read'),
      write: unexpected('documents.write'),
      setAside: unexpected('documents.setAside'),
      removeProfile: unexpected('documents.removeProfile'),
      listProfiles: unexpected('documents.listProfiles'),
    },
    pictures: {
      save: unexpected('pictures.save'),
      list: unexpected('pictures.list'),
      read: unexpected('pictures.read'),
      copy: unexpected('pictures.copy'),
      trash: unexpected('pictures.trash'),
      restore: unexpected('pictures.restore'),
      purge: unexpected('pictures.purge'),
    },
    window: {
      getState: unexpected('window.getState'),
      setFullscreen: unexpected('window.setFullscreen'),
      setKioskLock: unexpected('window.setKioskLock'),
      acknowledgeCloseRequest: unexpected('window.acknowledgeCloseRequest'),
      quit: unexpected('window.quit'),
    },
    output: {
      exportPicture: unexpected('output.exportPicture'),
      printPicture: unexpected('output.printPicture'),
    },
  };
  return { bridge, calls };
}

describe('handleBridgeCall', () => {
  it('passes validated arguments to the implementation and wraps the value', async () => {
    const { bridge } = fakeBridge();
    const write = vi.fn<BridgeImplementation['documents']['write']>(async () => undefined);
    bridge.documents.write = write;
    expect(await handleBridgeCall(bridge, 'documents.write', ['profile/p1/settings', '{"version":1}'])).toEqual({
      ok: true,
      value: undefined,
    });
    expect(write).toHaveBeenCalledWith('profile/p1/settings', '{"version":1}');
  });

  it('passes picture bytes through unchanged', async () => {
    const { bridge } = fakeBridge();
    const save = vi.fn<BridgeImplementation['pictures']['save']>(async () => ({ id: 'x', updatedAt: 1 }));
    bridge.pictures.save = save;
    await handleBridgeCall(bridge, 'pictures.save', ['p1', { png: PNG, thumbnail: PNG }]);
    expect(save).toHaveBeenCalledWith('p1', { png: PNG, thumbnail: PNG });
  });

  it.each<[string, string, unknown[], string]>([
    ['a document name outside the patterns', 'documents.read', ['../app'], 'argument 0: not a known document name'],
    ['a missing argument', 'documents.read', [], 'argument (all): Too small'],
    ['an extra argument', 'documents.read', ['app', 'more'], 'argument (all): Too big'],
    ['document text that is not a string', 'documents.write', ['app', 42], 'argument 1'],
    ['an unsafe profile id', 'documents.removeProfile', ['../../home'], 'argument 0: not a safe id'],
    ['an argument to a call that takes none', 'documents.listProfiles', ['../../home'], 'argument (all): Too big'],
    [
      'picture bytes as a plain array',
      'pictures.save',
      ['p1', { png: [137, 80], thumbnail: PNG }],
      'argument 1.png: expected bytes',
    ],
    [
      'a path smuggled into a save',
      'pictures.save',
      ['p1', { png: PNG, thumbnail: PNG, path: '/etc/x' }],
      'argument 1',
    ],
    [
      'an unsafe picture id in a save',
      'pictures.save',
      ['p1', { id: '../x', png: PNG, thumbnail: PNG }],
      'argument 1.id',
    ],
    ['an unknown place', 'pictures.list', ['p1', 'recycle'], 'argument 1'],
    ['an unknown picture file', 'pictures.read', ['p1', 'x', 'original'], 'argument 2'],
    ['an unsafe picture id', 'pictures.copy', ['p1', 'a/b'], 'argument 1: not a safe id'],
    ['an unsafe picture id to trash', 'pictures.trash', ['p1', '..'], 'argument 1'],
    ['an unsafe picture id to restore', 'pictures.restore', ['p1', ''], 'argument 1'],
    ['an unsafe picture id to purge', 'pictures.purge', ['p1', 'X'], 'argument 1'],
    ['a fullscreen string', 'window.setFullscreen', ['yes'], 'argument 0'],
    ['a kiosk lock number', 'window.setKioskLock', [1], 'argument 0'],
    ['an argument to quit', 'window.quit', [true], 'argument (all)'],
    ['an export name with a path', 'output.exportPicture', [PNG, '../a'], 'argument 1: not an allowed file name'],
    ['print bytes as a string', 'output.printPicture', ['png'], 'argument 0: expected bytes'],
  ])('rejects %s before the implementation runs', async (_label, method, args, reason) => {
    const { bridge, calls } = fakeBridge();
    const result = await handleBridgeCall(bridge, method, args);
    expect(result).toMatchObject({ ok: false, code: 'invalid-argument', message: expect.stringContaining(reason) });
    expect(result).toMatchObject({ message: expect.stringMatching(new RegExp(`^${method.replace('.', '\\.')}: `)) });
    expect(calls).toEqual([]);
  });

  it('rejects an unknown method', async () => {
    const { bridge, calls } = fakeBridge();
    expect(await handleBridgeCall(bridge, 'documents.delete', ['app'])).toEqual({
      ok: false,
      code: 'invalid-argument',
      message: 'Unknown method documents.delete.',
    });
    expect(calls).toEqual([]);
  });

  it('keeps the code of a bridge error', async () => {
    const { bridge } = fakeBridge();
    bridge.pictures.restore = async () => {
      throw new BridgeError('not-found', 'No picture x in the trash.');
    };
    expect(await handleBridgeCall(bridge, 'pictures.restore', ['p1', 'x'])).toEqual({
      ok: false,
      code: 'not-found',
      message: 'No picture x in the trash.',
    });
  });

  it('turns any other failure into an io error without its details', async () => {
    const { bridge } = fakeBridge();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    bridge.documents.read = async () => {
      throw new Error('EACCES: /home/someone/secret');
    };
    expect(await handleBridgeCall(bridge, 'documents.read', ['app'])).toEqual({
      ok: false,
      code: 'io',
      message: 'documents.read failed.',
    });
  });
});

describe('isTrustedSender', () => {
  const trusted = { webContentsId: 1, origins: ['app://bundle'] };
  const sender = { webContentsId: 1, frameUrl: 'app://bundle/index.html#/home', isMainFrame: true };

  it('trusts the top frame of the app window on the bundle', () => {
    expect(isTrustedSender(sender, trusted)).toBe(true);
  });

  it.each([
    ['another web contents', { webContentsId: 2 }],
    ['a subframe', { isMainFrame: false }],
    ['a frame that is gone', { frameUrl: null }],
    ['another app:// host', { frameUrl: 'app://evil/index.html' }],
    ['a page from the network', { frameUrl: 'https://example.com/' }],
    ['a data URL page', { frameUrl: 'data:text/html,hi' }],
  ])('rejects %s', (_label, change) => {
    expect(isTrustedSender({ ...sender, ...change }, trusted)).toBe(false);
  });

  it('trusts the dev server origin when that is the app page', () => {
    const dev = { webContentsId: 1, origins: ['http://127.0.0.1:5173'] };
    expect(isTrustedSender({ ...sender, frameUrl: 'http://127.0.0.1:5173/' }, dev)).toBe(true);
    expect(isTrustedSender({ ...sender, frameUrl: 'http://127.0.0.1:5174/' }, dev)).toBe(false);
  });
});

describe('originOf', () => {
  it.each([
    ['app://bundle/index.html', 'app://bundle'],
    ['http://127.0.0.1:5173/x', 'http://127.0.0.1:5173'],
    ['data:text/html,x', null],
    ['not a url', null],
  ])('%s', (url, origin) => {
    expect(originOf(url)).toBe(origin);
  });
});
