import {
  BridgeError,
  type OsFamily,
  type PictureFile,
  type PictureSummary,
  type PlatformBridge,
  type WindowState,
} from '../core/platform/bridge.ts';
import {
  hasPngSignature,
  MAX_DOCUMENT_BYTES,
  MAX_PICTURE_BYTES,
  MAX_THUMBNAIL_BYTES,
  utf8ByteLength,
} from '../core/platform/limits.ts';
import {
  isDocumentName,
  isExportFileStem,
  isSafeId,
  setAsideFileName,
  type DocumentName,
  type PicturePlace,
} from '../core/platform/names.ts';

const DATABASE_NAME = 'wild-kids-computers';
const DATABASE_VERSION = 1;
const DOCUMENTS = 'documents';
const PICTURES = 'pictures';
const BY_PROFILE = 'byProfile';

interface DocumentRecord {
  text: string;
}

interface PictureRecord {
  profileId: string;
  id: string;
  place: PicturePlace;
  png: Uint8Array;
  thumbnail: Uint8Array;
  updatedAt: number;
}

export interface BrowserBridgeOptions {
  indexedDB: IDBFactory;
  /** The page the bridge runs in, for fullscreen, downloads, and printing. */
  window: Window;
  appVersion: string;
  now?: () => number;
  newId?: () => string;
}

function request<T>(pending: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    pending.addEventListener('success', () => resolve(pending.result));
    pending.addEventListener('error', () =>
      reject(new BridgeError('io', pending.error?.message ?? 'IndexedDB failed.')),
    );
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    const fail = () => reject(new BridgeError('io', transaction.error?.message ?? 'IndexedDB transaction failed.'));
    transaction.addEventListener('error', fail);
    transaction.addEventListener('abort', fail);
  });
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  const opening = factory.open(DATABASE_NAME, DATABASE_VERSION);
  opening.addEventListener('upgradeneeded', () => {
    const db = opening.result;
    db.createObjectStore(DOCUMENTS);
    const pictures = db.createObjectStore(PICTURES, { keyPath: ['profileId', 'id'] });
    pictures.createIndex(BY_PROFILE, 'profileId');
  });
  return request(opening);
}

function requireDocumentName(name: unknown): DocumentName {
  if (!isDocumentName(name))
    throw new BridgeError('invalid-argument', `Unknown document name ${JSON.stringify(name)}.`);
  return name;
}

function requireId(value: unknown, label: string): string {
  if (!isSafeId(value)) throw new BridgeError('invalid-argument', `${label} is not a safe id.`);
  return value;
}

function requirePlace(value: unknown): PicturePlace {
  if (value !== 'gallery' && value !== 'trash')
    throw new BridgeError('invalid-argument', 'place must be gallery or trash.');
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new BridgeError('invalid-argument', `${label} must be true or false.`);
  return value;
}

function requirePng(bytes: unknown, max: number, label: string): Uint8Array {
  if (!(bytes instanceof Uint8Array)) throw new BridgeError('invalid-argument', `The ${label} must be bytes.`);
  if (bytes.length > max) throw new BridgeError('too-large', `The ${label} is over ${max} bytes.`);
  if (!hasPngSignature(bytes)) throw new BridgeError('invalid-argument', `The ${label} is not a PNG file.`);
  return bytes;
}

function osFamilyFromPlatform(platform: string): OsFamily {
  if (/mac|iphone|ipad/i.test(platform)) return 'mac';
  if (/win/i.test(platform)) return 'windows';
  return 'linux';
}

function toSummary(record: PictureRecord): PictureSummary {
  return { id: record.id, updatedAt: record.updatedAt };
}

/**
 * The PlatformBridge over IndexedDB, for the static browser build. It enforces the same names,
 * caps, and signatures as the Electron build, so the contract suite passes against both.
 */
export function createBrowserBridge(options: BrowserBridgeOptions): PlatformBridge {
  const page = options.window;
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => page.crypto.randomUUID());
  let database: Promise<IDBDatabase> | undefined;
  let kioskLock = false;

  async function transaction(stores: string[], mode: IDBTransactionMode) {
    database ??= openDatabase(options.indexedDB);
    return (await database).transaction(stores, mode);
  }

  async function getPicture(profileId: string, id: string): Promise<PictureRecord | undefined> {
    const tx = await transaction([PICTURES], 'readonly');
    return request<PictureRecord | undefined>(tx.objectStore(PICTURES).get([profileId, id]));
  }

  async function requirePicture(profileId: string, id: string, place: PicturePlace): Promise<PictureRecord> {
    const record = await getPicture(requireId(profileId, 'profileId'), requireId(id, 'id'));
    if (record?.place !== place) throw new BridgeError('not-found', `No picture ${id} in the ${place}.`);
    return record;
  }

  async function putPicture(record: PictureRecord): Promise<void> {
    const tx = await transaction([PICTURES], 'readwrite');
    tx.objectStore(PICTURES).put(record);
    await done(tx);
  }

  function windowState(): WindowState {
    return { fullscreen: page.document.fullscreenElement !== null, kioskLock };
  }

  async function setFullscreen(on: boolean): Promise<void> {
    const doc = page.document;
    try {
      if (on && doc.fullscreenElement === null) await doc.documentElement.requestFullscreen();
      if (!on && doc.fullscreenElement !== null) await doc.exitFullscreen();
    } catch {
      // A browser allows fullscreen only after a user gesture. Without one the page stays as is.
    }
  }

  return {
    info: async () => ({
      os: osFamilyFromPlatform(page.navigator.platform),
      appVersion: options.appVersion,
      isElectron: false,
    }),

    documents: {
      async read(name) {
        const key = requireDocumentName(name);
        const tx = await transaction([DOCUMENTS], 'readonly');
        const record = await request<DocumentRecord | undefined>(tx.objectStore(DOCUMENTS).get(key));
        if (record === undefined) return null;
        if (utf8ByteLength(record.text) > MAX_DOCUMENT_BYTES) {
          throw new BridgeError('too-large', `The saved ${key} document is over ${MAX_DOCUMENT_BYTES} bytes.`);
        }
        return record.text;
      },

      async write(name, text) {
        const key = requireDocumentName(name);
        if (typeof text !== 'string') throw new BridgeError('invalid-argument', 'A document is text.');
        if (utf8ByteLength(text) > MAX_DOCUMENT_BYTES) {
          throw new BridgeError('too-large', `The ${key} document is over ${MAX_DOCUMENT_BYTES} bytes.`);
        }
        const tx = await transaction([DOCUMENTS], 'readwrite');
        tx.objectStore(DOCUMENTS).put({ text } satisfies DocumentRecord, key);
        await done(tx);
      },

      async setAside(name) {
        const key = requireDocumentName(name);
        const tx = await transaction([DOCUMENTS], 'readwrite');
        const store = tx.objectStore(DOCUMENTS);
        const record = await request<DocumentRecord | undefined>(store.get(key));
        if (record === undefined) return false;
        const stamp = now();
        let attempt = 0;
        while ((await request(store.count(setAsideFileName(key, stamp, attempt)))) > 0) attempt += 1;
        store.put(record, setAsideFileName(key, stamp, attempt));
        store.delete(key);
        await done(tx);
        return true;
      },

      async removeProfile(profileId) {
        const id = requireId(profileId, 'profileId');
        const prefix = `profile/${id}/`;
        const tx = await transaction([DOCUMENTS, PICTURES], 'readwrite');
        tx.objectStore(DOCUMENTS).delete(IDBKeyRange.bound(prefix, `${prefix}￿`));
        const pictures = tx.objectStore(PICTURES);
        const keys = await request(pictures.index(BY_PROFILE).getAllKeys(id));
        for (const key of keys) pictures.delete(key);
        await done(tx);
      },

      async listProfiles() {
        const tx = await transaction([DOCUMENTS, PICTURES], 'readonly');
        const [documentKeys, pictureKeys] = await Promise.all([
          request(tx.objectStore(DOCUMENTS).getAllKeys(IDBKeyRange.bound('profile/', 'profile/\uffff'))),
          request(tx.objectStore(PICTURES).getAllKeys()),
        ]);
        const ids = new Set<string>();
        for (const key of documentKeys) {
          const id = typeof key === 'string' ? key.split('/')[1] : undefined;
          if (isSafeId(id)) ids.add(id);
        }
        for (const key of pictureKeys) {
          const id: unknown = Array.isArray(key) ? key[0] : undefined;
          if (isSafeId(id)) ids.add(id);
        }
        return [...ids].toSorted();
      },
    },

    pictures: {
      async save(profileId, input) {
        requireId(profileId, 'profileId');
        const png = requirePng(input.png, MAX_PICTURE_BYTES, 'picture');
        const thumbnail = requirePng(input.thumbnail, MAX_THUMBNAIL_BYTES, 'thumbnail');
        // A save under a known id creates or overwrites that picture, as in the Electron build.
        if (input.id !== undefined && (await getPicture(profileId, requireId(input.id, 'id')))?.place === 'trash') {
          throw new BridgeError('not-found', `Picture ${input.id} is in the trash.`);
        }
        const record: PictureRecord = {
          profileId,
          id: input.id ?? newId(),
          place: 'gallery',
          png: png.slice(),
          thumbnail: thumbnail.slice(),
          updatedAt: now(),
        };
        await putPicture(record);
        return toSummary(record);
      },

      async list(profileId, place) {
        const id = requireId(profileId, 'profileId');
        const where = requirePlace(place);
        const tx = await transaction([PICTURES], 'readonly');
        const records = await request<PictureRecord[]>(tx.objectStore(PICTURES).index(BY_PROFILE).getAll(id));
        return records
          .filter((record) => record.place === where)
          .map(toSummary)
          .toSorted((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
      },

      async read(profileId, id, file: PictureFile) {
        if (file !== 'picture' && file !== 'thumbnail') {
          throw new BridgeError('invalid-argument', 'file must be picture or thumbnail.');
        }
        const record = await getPicture(requireId(profileId, 'profileId'), requireId(id, 'id'));
        if (record === undefined) throw new BridgeError('not-found', `No ${file} for picture ${id}.`);
        const bytes = file === 'picture' ? record.png : record.thumbnail;
        // The same caps as a save, so both builds refuse a damaged record the same way.
        const max = file === 'picture' ? MAX_PICTURE_BYTES : MAX_THUMBNAIL_BYTES;
        if (bytes.length > max) throw new BridgeError('too-large', `The saved ${file} is over ${max} bytes.`);
        if (!hasPngSignature(bytes))
          throw new BridgeError('io', `The saved ${file} for picture ${id} is not a PNG file.`);
        return bytes.slice();
      },

      async copy(profileId, id) {
        const source = await requirePicture(profileId, id, 'gallery');
        const record: PictureRecord = { ...source, id: newId(), updatedAt: now() };
        await putPicture(record);
        return toSummary(record);
      },

      async trash(profileId, id) {
        const record = await requirePicture(profileId, id, 'gallery');
        await putPicture({ ...record, place: 'trash' });
      },

      async restore(profileId, id) {
        const record = await requirePicture(profileId, id, 'trash');
        const restored: PictureRecord = { ...record, place: 'gallery' };
        await putPicture(restored);
        return toSummary(restored);
      },

      async purge(profileId, id) {
        await requirePicture(profileId, id, 'trash');
        const tx = await transaction([PICTURES], 'readwrite');
        tx.objectStore(PICTURES).delete([profileId, id]);
        await done(tx);
      },
    },

    window: {
      getState: async () => windowState(),
      async setFullscreen(on) {
        requireBoolean(on, 'fullscreen');
        if (!kioskLock) await setFullscreen(on);
        return windowState();
      },
      async setKioskLock(on) {
        kioskLock = requireBoolean(on, 'kioskLock');
        await setFullscreen(on);
        return windowState();
      },
      // A browser tab cannot hold a close, so no close request ever arrives.
      onCloseRequest: () => () => undefined,
      // A browser tab has no application menu.
      onMenuCommand: () => () => undefined,
      acknowledgeCloseRequest: async () => undefined,
      quit: async () => page.close(),
    },

    output: {
      async exportPicture(png, fileStem) {
        const bytes = requirePng(png, MAX_PICTURE_BYTES, 'picture');
        if (!isExportFileStem(fileStem)) throw new BridgeError('invalid-argument', 'The file name is not allowed.');
        const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'image/png' }));
        const link = page.document.createElement('a');
        link.href = url;
        link.download = `${fileStem}.png`;
        page.document.body.append(link);
        link.click();
        link.remove();
        // The download has started by the time the click returns. A browser cannot report cancel.
        page.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return 'saved';
      },

      async printPicture(png) {
        const bytes = requirePng(png, MAX_PICTURE_BYTES, 'picture');
        const doc = page.document;
        const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'image/png' }));
        const sheet = doc.createElement('div');
        sheet.dataset.wkPrint = '';
        const style = doc.createElement('style');
        style.textContent =
          '@media screen{[data-wk-print]{display:none}}' +
          '@media print{body>*:not([data-wk-print]){display:none!important}' +
          '[data-wk-print] img{display:block;max-width:100%;max-height:100vh;margin:auto;object-fit:contain}}';
        const image = doc.createElement('img');
        image.alt = '';
        image.src = url;
        sheet.append(style, image);
        doc.body.append(sheet);
        try {
          await image.decode();
          // window.print blocks until the dialog closes. A browser cannot report cancel.
          page.print();
          return 'printed';
        } finally {
          sheet.remove();
          URL.revokeObjectURL(url);
        }
      },
    },
  };
}
