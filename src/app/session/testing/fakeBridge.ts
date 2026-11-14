import {
  BridgeError,
  type PictureFile,
  type PictureSummary,
  type PlatformBridge,
  type SavePictureInput,
} from '../../../core/platform/bridge.ts';
import { isDocumentName, type DocumentName, type PicturePlace } from '../../../core/platform/names.ts';
import type { TestInfo } from '../../../core/platform/testInfo.ts';

/**
 * A PlatformBridge at the I/O edge for unit tests. Documents and pictures live in memory. Every
 * call is logged in order, so a test can assert what reached the platform. Window and output
 * calls throw unless a test configures them, so code that starts using a new part of the bridge
 * fails loudly instead of getting `undefined`.
 *
 * `holdWrites()` parks every document write until the test settles it with `release()` or
 * `fail()`, so a test can control the order in which writes finish.
 */
export interface FakeBridge {
  readonly bridge: PlatformBridge;
  /** Saved document text by name. Tests read and seed it directly. */
  readonly documents: Map<DocumentName, string>;
  /** Names that were set aside, in order. */
  readonly setAside: DocumentName[];
  /** Every bridge call, as `<area>.<method> <first argument>`. */
  readonly calls: string[];
  /** Parks writes from now on. */
  holdWrites(): void;
  /** Releases every parked write, in order, and stops parking new ones. */
  resumeWrites(): void;
  /** Writes parked so far, oldest first. */
  readonly heldWrites: readonly HeldWrite[];
  /** Resolves once at least `count` writes have been parked. */
  heldWritesReach(count: number): Promise<void>;
  /** Makes the next document operation of this kind on this name reject with the error. */
  failNext(operation: 'read' | 'write' | 'removeProfile', target: string, error: Error): void;
  /** Picture ids saved per profile and place. */
  pictureIds(profileId: string, place: PicturePlace): string[];
}

interface HeldWrite {
  readonly name: DocumentName;
  readonly text: string;
  /** Stores the text and resolves the write. */
  release(): void;
  /** Rejects the write and stores nothing. */
  fail(error: Error): void;
}

export interface FakeBridgeOptions {
  documents?: Partial<Record<DocumentName, string>>;
  /** What `info().test` returns. Omit it for a run that is not under test. */
  test?: TestInfo;
  /** Implementations for window calls the test expects. Anything else throws. */
  window?: Partial<PlatformBridge['window']>;
  /** The clock pictures use for `updatedAt`. */
  now?: () => number;
}

interface StoredPicture {
  png: Uint8Array;
  thumbnail: Uint8Array;
  updatedAt: number;
}

function notConfigured(name: string): never {
  throw new Error(`fakeBridge: ${name} was called but the test did not configure it.`);
}

export function createFakeBridge(options: FakeBridgeOptions = {}): FakeBridge {
  const documents = new Map<DocumentName, string>();
  for (const [name, text] of Object.entries(options.documents ?? {})) {
    if (!isDocumentName(name)) throw new Error(`fakeBridge: ${name} is not a document name.`);
    if (text !== undefined) documents.set(name, text);
  }
  const setAside: DocumentName[] = [];
  const calls: string[] = [];
  const heldWrites: HeldWrite[] = [];
  const failures = new Map<string, Error>();
  const pictures = new Map<string, Map<string, StoredPicture>>();
  const now = options.now ?? (() => 1_000);
  let holding = false;
  const heldWaiters: Array<{ count: number; resolve: () => void }> = [];
  let nextPictureId = 1;

  function takeFailure(operation: string, target: string): Error | undefined {
    const key = `${operation} ${target}`;
    const error = failures.get(key);
    failures.delete(key);
    return error;
  }

  function place(profileId: string, where: PicturePlace): Map<string, StoredPicture> {
    const key = `${profileId}/${where}`;
    let found = pictures.get(key);
    if (found === undefined) {
      found = new Map();
      pictures.set(key, found);
    }
    return found;
  }

  function summary(id: string, picture: StoredPicture): PictureSummary {
    return { id, updatedAt: picture.updatedAt };
  }

  function take(profileId: string, where: PicturePlace, id: string): StoredPicture {
    const picture = place(profileId, where).get(id);
    if (picture === undefined) throw new BridgeError('not-found', `No picture ${id} in ${where}.`);
    return picture;
  }

  const window: PlatformBridge['window'] = {
    getState: options.window?.getState ?? (() => notConfigured('window.getState')),
    setFullscreen: options.window?.setFullscreen ?? (() => notConfigured('window.setFullscreen')),
    setKioskLock: options.window?.setKioskLock ?? (() => notConfigured('window.setKioskLock')),
    onCloseRequest: options.window?.onCloseRequest ?? (() => notConfigured('window.onCloseRequest')),
    onMenuCommand: options.window?.onMenuCommand ?? (() => notConfigured('window.onMenuCommand')),
    acknowledgeCloseRequest:
      options.window?.acknowledgeCloseRequest ?? (() => notConfigured('window.acknowledgeCloseRequest')),
    quit: options.window?.quit ?? (() => notConfigured('window.quit')),
  };

  const bridge: PlatformBridge = {
    info: () => {
      calls.push('info');
      return Promise.resolve({
        os: 'linux',
        appVersion: '0.0.0-test',
        isElectron: true,
        ...(options.test === undefined ? {} : { test: options.test }),
      });
    },
    documents: {
      read: (name) => {
        calls.push(`documents.read ${name}`);
        const error = takeFailure('read', name);
        if (error !== undefined) return Promise.reject(error);
        return Promise.resolve(documents.get(name) ?? null);
      },
      write: (name, text) => {
        calls.push(`documents.write ${name}`);
        const error = takeFailure('write', name);
        if (error !== undefined) return Promise.reject(error);
        if (!holding) {
          documents.set(name, text);
          return Promise.resolve();
        }
        let settled = false;
        return new Promise<void>((resolve, reject) => {
          heldWrites.push({
            name,
            text,
            release: () => {
              if (settled) return;
              settled = true;
              documents.set(name, text);
              resolve();
            },
            fail: (reason) => {
              if (settled) return;
              settled = true;
              reject(reason);
            },
          });
          for (const waiter of heldWaiters.filter((w) => w.count <= heldWrites.length)) {
            heldWaiters.splice(heldWaiters.indexOf(waiter), 1);
            waiter.resolve();
          }
        });
      },
      setAside: (name) => {
        calls.push(`documents.setAside ${name}`);
        const existed = documents.delete(name);
        if (existed) setAside.push(name);
        return Promise.resolve(existed);
      },
      removeProfile: (profileId) => {
        calls.push(`documents.removeProfile ${profileId}`);
        const error = takeFailure('removeProfile', profileId);
        if (error !== undefined) return Promise.reject(error);
        for (const name of documents.keys()) {
          if (name.startsWith(`profile/${profileId}/`)) documents.delete(name);
        }
        pictures.delete(`${profileId}/gallery`);
        pictures.delete(`${profileId}/trash`);
        return Promise.resolve();
      },
    },
    pictures: {
      save: (profileId, input: SavePictureInput) => {
        calls.push(`pictures.save ${profileId}`);
        const id = input.id ?? `picture-${nextPictureId++}`;
        const picture = { png: input.png, thumbnail: input.thumbnail, updatedAt: now() };
        place(profileId, 'gallery').set(id, picture);
        return Promise.resolve(summary(id, picture));
      },
      list: (profileId, where) => {
        calls.push(`pictures.list ${profileId}`);
        const found = [...place(profileId, where)].map(([id, picture]) => summary(id, picture));
        return Promise.resolve(found.toSorted((a, b) => b.updatedAt - a.updatedAt));
      },
      read: async (profileId, id, file: PictureFile) => {
        calls.push(`pictures.read ${profileId}`);
        const gallery = place(profileId, 'gallery').get(id);
        const picture = gallery ?? take(profileId, 'trash', id);
        return file === 'picture' ? picture.png : picture.thumbnail;
      },
      copy: async (profileId, id) => {
        calls.push(`pictures.copy ${profileId}`);
        const source = take(profileId, 'gallery', id);
        const copyId = `picture-${nextPictureId++}`;
        const copy = { ...source, updatedAt: now() };
        place(profileId, 'gallery').set(copyId, copy);
        return summary(copyId, copy);
      },
      trash: async (profileId, id) => {
        calls.push(`pictures.trash ${profileId}`);
        const picture = take(profileId, 'gallery', id);
        place(profileId, 'gallery').delete(id);
        place(profileId, 'trash').set(id, picture);
      },
      restore: async (profileId, id) => {
        calls.push(`pictures.restore ${profileId}`);
        const picture = take(profileId, 'trash', id);
        place(profileId, 'trash').delete(id);
        place(profileId, 'gallery').set(id, picture);
        return summary(id, picture);
      },
      purge: async (profileId, id) => {
        calls.push(`pictures.purge ${profileId}`);
        take(profileId, 'trash', id);
        place(profileId, 'trash').delete(id);
      },
    },
    window,
    output: {
      exportPicture: () => notConfigured('output.exportPicture'),
      printPicture: () => notConfigured('output.printPicture'),
    },
  };

  return {
    bridge,
    documents,
    setAside,
    calls,
    heldWrites,
    holdWrites: () => {
      holding = true;
    },
    heldWritesReach: (count) =>
      new Promise<void>((resolve) => {
        if (heldWrites.length >= count) resolve();
        else heldWaiters.push({ count, resolve });
      }),
    resumeWrites: () => {
      holding = false;
      for (const write of heldWrites) write.release();
    },
    failNext: (operation, target, error) => {
      failures.set(`${operation} ${target}`, error);
    },
    pictureIds: (profileId, where) => [...place(profileId, where).keys()],
  };
}
