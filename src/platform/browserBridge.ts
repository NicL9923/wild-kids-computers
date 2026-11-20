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
const DATABASE_VERSION = 2;
const DOCUMENTS = 'documents';
/** Legacy v1 store that combined metadata and full PNG bytes. Deleted during upgrade to v2. */
const LEGACY_PICTURES = 'pictures';
const PICTURE_META = 'pictureMeta';
const PICTURE_BLOBS = 'pictureBlobs';
const BY_PROFILE = 'byProfile';

interface DocumentRecord {
  text: string;
}

interface LegacyPictureRecord {
  profileId: string;
  id: string;
  place: PicturePlace;
  png: Uint8Array;
  thumbnail: Uint8Array;
  updatedAt: number;
}

function isLegacyPictureRecord(value: unknown): value is LegacyPictureRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'profileId') === 'string' &&
    typeof Reflect.get(value, 'id') === 'string' &&
    (Reflect.get(value, 'place') === 'gallery' || Reflect.get(value, 'place') === 'trash') &&
    Reflect.get(value, 'png') instanceof Uint8Array &&
    Reflect.get(value, 'thumbnail') instanceof Uint8Array &&
    typeof Reflect.get(value, 'updatedAt') === 'number'
  );
}

interface PictureMetaRecord {
  profileId: string;
  id: string;
  place: PicturePlace;
  updatedAt: number;
}

interface PictureBlobRecord {
  profileId: string;
  id: string;
  file: PictureFile;
  bytes: Uint8Array;
}

export interface BrowserBridgeOptions {
  indexedDB: IDBFactory;
  /** The page the bridge runs in, for fullscreen, downloads, and printing. */
  window: Window;
  appVersion: string;
  now?: () => number;
  newId?: () => string;
}

function idbError(error: DOMException | null | undefined, fallback: string): BridgeError {
  if (error?.name === 'QuotaExceededError') {
    return new BridgeError('storage-full', error.message || 'Browser storage is full.');
  }
  return new BridgeError('io', error?.message ?? fallback);
}

function request<T>(pending: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    pending.addEventListener('success', () => resolve(pending.result));
    pending.addEventListener('error', () => reject(idbError(pending.error, 'IndexedDB failed.')));
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    const fail = () => reject(idbError(transaction.error, 'IndexedDB transaction failed.'));
    transaction.addEventListener('error', fail);
    transaction.addEventListener('abort', fail);
  });
}

function openDatabase(factory: IDBFactory, onReset: () => void): Promise<IDBDatabase> {
  let opening: IDBOpenDBRequest;
  try {
    opening = factory.open(DATABASE_NAME, DATABASE_VERSION);
  } catch (error) {
    return Promise.reject(new BridgeError('io', error instanceof Error ? error.message : 'IndexedDB could not open.'));
  }
  opening.addEventListener('upgradeneeded', () => {
    const db = opening.result;
    const tx = opening.transaction;
    if (!db.objectStoreNames.contains(DOCUMENTS)) db.createObjectStore(DOCUMENTS);
    const meta = db.objectStoreNames.contains(PICTURE_META)
      ? tx?.objectStore(PICTURE_META)
      : (() => {
          const store = db.createObjectStore(PICTURE_META, { keyPath: ['profileId', 'id'] });
          store.createIndex(BY_PROFILE, 'profileId');
          return store;
        })();
    const blobs = db.objectStoreNames.contains(PICTURE_BLOBS)
      ? tx?.objectStore(PICTURE_BLOBS)
      : (() => {
          const store = db.createObjectStore(PICTURE_BLOBS, { keyPath: ['profileId', 'id', 'file'] });
          store.createIndex(BY_PROFILE, 'profileId');
          return store;
        })();
    if (db.objectStoreNames.contains(LEGACY_PICTURES) && tx !== null && meta !== undefined && blobs !== undefined) {
      const legacy = tx.objectStore(LEGACY_PICTURES);
      const cursorRequest = legacy.openCursor();
      cursorRequest.addEventListener('success', () => {
        const cursor = cursorRequest.result;
        if (cursor === null) {
          db.deleteObjectStore(LEGACY_PICTURES);
          return;
        }
        const value: unknown = cursor.value;
        if (!isLegacyPictureRecord(value)) {
          cursor.continue();
          return;
        }
        const record = value;
        meta.put({
          profileId: record.profileId,
          id: record.id,
          place: record.place,
          updatedAt: record.updatedAt,
        } satisfies PictureMetaRecord);
        blobs.put({
          profileId: record.profileId,
          id: record.id,
          file: 'picture',
          bytes: record.png,
        } satisfies PictureBlobRecord);
        blobs.put({
          profileId: record.profileId,
          id: record.id,
          file: 'thumbnail',
          bytes: record.thumbnail,
        } satisfies PictureBlobRecord);
        cursor.continue();
      });
    }
  });
  return new Promise<IDBDatabase>((resolve, reject) => {
    opening.addEventListener('success', () => {
      const db = opening.result;
      db.addEventListener('close', onReset);
      db.addEventListener('versionchange', () => {
        onReset();
        db.close();
      });
      resolve(db);
    });
    opening.addEventListener('error', () => reject(idbError(opening.error, 'IndexedDB failed to open.')));
    opening.addEventListener('blocked', () =>
      reject(new BridgeError('io', 'IndexedDB upgrade is blocked by another open tab.')),
    );
  });
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

function toSummary(record: PictureMetaRecord): PictureSummary {
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
  let persistenceRequested = false;
  let kioskLock = false;

  function clearDatabase(expected?: Promise<IDBDatabase>): void {
    if (expected === undefined || database === expected) database = undefined;
  }

  async function transaction(stores: string[], mode: IDBTransactionMode): Promise<IDBTransaction> {
    if (!persistenceRequested) {
      persistenceRequested = true;
      void page.navigator?.storage?.persist?.().catch(() => undefined);
    }
    if (database === undefined) {
      const opening = openDatabase(options.indexedDB, () => clearDatabase(opening));
      opening.catch(() => clearDatabase(opening));
      database = opening;
    }
    const db = await database;
    try {
      return db.transaction(stores, mode);
    } catch (error) {
      clearDatabase();
      throw new BridgeError('io', error instanceof Error ? error.message : 'IndexedDB transaction could not start.');
    }
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
        const tx = await transaction([DOCUMENTS, PICTURE_META, PICTURE_BLOBS], 'readwrite');
        tx.objectStore(DOCUMENTS).delete(IDBKeyRange.bound(prefix, `${prefix}￿`));
        const meta = tx.objectStore(PICTURE_META);
        const metaKeys = await request(meta.index(BY_PROFILE).getAllKeys(id));
        for (const key of metaKeys) meta.delete(key);
        const blobs = tx.objectStore(PICTURE_BLOBS);
        const blobKeys = await request(blobs.index(BY_PROFILE).getAllKeys(id));
        for (const key of blobKeys) blobs.delete(key);
        await done(tx);
      },
    },

    pictures: {
      async save(profileId, input) {
        requireId(profileId, 'profileId');
        const png = requirePng(input.png, MAX_PICTURE_BYTES, 'picture');
        const thumbnail = requirePng(input.thumbnail, MAX_THUMBNAIL_BYTES, 'thumbnail');
        const pictureId = input.id === undefined ? newId() : requireId(input.id, 'id');
        // Check and write in one readwrite transaction so a concurrent trash cannot race with save.
        const tx = await transaction([PICTURE_META, PICTURE_BLOBS], 'readwrite');
        const metaStore = tx.objectStore(PICTURE_META);
        if (input.id !== undefined) {
          const existing = await request<PictureMetaRecord | undefined>(metaStore.get([profileId, pictureId]));
          if (existing?.place === 'trash') {
            tx.abort();
            throw new BridgeError('not-found', `Picture ${pictureId} is in the trash.`);
          }
        }
        const meta: PictureMetaRecord = { profileId, id: pictureId, place: 'gallery', updatedAt: now() };
        metaStore.put(meta);
        const blobStore = tx.objectStore(PICTURE_BLOBS);
        blobStore.put({
          profileId,
          id: pictureId,
          file: 'picture',
          bytes: png.slice(),
        } satisfies PictureBlobRecord);
        blobStore.put({
          profileId,
          id: pictureId,
          file: 'thumbnail',
          bytes: thumbnail.slice(),
        } satisfies PictureBlobRecord);
        await done(tx);
        return toSummary(meta);
      },

      async list(profileId, place) {
        const id = requireId(profileId, 'profileId');
        const where = requirePlace(place);
        const tx = await transaction([PICTURE_META], 'readonly');
        const records = await request<PictureMetaRecord[]>(tx.objectStore(PICTURE_META).index(BY_PROFILE).getAll(id));
        return records
          .filter((record) => record.place === where)
          .map(toSummary)
          .toSorted((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
      },

      async read(profileId, id, file: PictureFile) {
        if (file !== 'picture' && file !== 'thumbnail') {
          throw new BridgeError('invalid-argument', 'file must be picture or thumbnail.');
        }
        const pid = requireId(profileId, 'profileId');
        const picId = requireId(id, 'id');
        const tx = await transaction([PICTURE_BLOBS], 'readonly');
        const record = await request<PictureBlobRecord | undefined>(
          tx.objectStore(PICTURE_BLOBS).get([pid, picId, file]),
        );
        if (record === undefined) throw new BridgeError('not-found', `No ${file} for picture ${id}.`);
        const bytes = record.bytes;
        // The same caps as a save, so both builds refuse a damaged record the same way.
        const max = file === 'picture' ? MAX_PICTURE_BYTES : MAX_THUMBNAIL_BYTES;
        if (bytes.length > max) throw new BridgeError('too-large', `The saved ${file} is over ${max} bytes.`);
        if (!hasPngSignature(bytes))
          throw new BridgeError('io', `The saved ${file} for picture ${id} is not a PNG file.`);
        return bytes.slice();
      },

      async copy(profileId, id) {
        const pid = requireId(profileId, 'profileId');
        const picId = requireId(id, 'id');
        const tx = await transaction([PICTURE_META, PICTURE_BLOBS], 'readwrite');
        const metaStore = tx.objectStore(PICTURE_META);
        const blobStore = tx.objectStore(PICTURE_BLOBS);
        const source = await request<PictureMetaRecord | undefined>(metaStore.get([pid, picId]));
        if (source?.place !== 'gallery') {
          tx.abort();
          throw new BridgeError('not-found', `No picture ${id} in the gallery.`);
        }
        const [pngRecord, thumbRecord] = await Promise.all([
          request<PictureBlobRecord | undefined>(blobStore.get([pid, picId, 'picture'])),
          request<PictureBlobRecord | undefined>(blobStore.get([pid, picId, 'thumbnail'])),
        ]);
        if (pngRecord === undefined) {
          tx.abort();
          throw new BridgeError('not-found', `No picture ${id} in the gallery.`);
        }
        const copyId = newId();
        const meta: PictureMetaRecord = { profileId: pid, id: copyId, place: 'gallery', updatedAt: now() };
        metaStore.put(meta);
        blobStore.put({
          profileId: pid,
          id: copyId,
          file: 'picture',
          bytes: pngRecord.bytes.slice(),
        } satisfies PictureBlobRecord);
        if (thumbRecord !== undefined) {
          blobStore.put({
            profileId: pid,
            id: copyId,
            file: 'thumbnail',
            bytes: thumbRecord.bytes.slice(),
          } satisfies PictureBlobRecord);
        }
        await done(tx);
        return toSummary(meta);
      },

      async trash(profileId, id) {
        const pid = requireId(profileId, 'profileId');
        const picId = requireId(id, 'id');
        const tx = await transaction([PICTURE_META], 'readwrite');
        const metaStore = tx.objectStore(PICTURE_META);
        const record = await request<PictureMetaRecord | undefined>(metaStore.get([pid, picId]));
        if (record?.place !== 'gallery') {
          tx.abort();
          throw new BridgeError('not-found', `No picture ${id} in the gallery.`);
        }
        metaStore.put({ ...record, place: 'trash' } satisfies PictureMetaRecord);
        await done(tx);
      },

      async restore(profileId, id) {
        const pid = requireId(profileId, 'profileId');
        const picId = requireId(id, 'id');
        const tx = await transaction([PICTURE_META], 'readwrite');
        const metaStore = tx.objectStore(PICTURE_META);
        const record = await request<PictureMetaRecord | undefined>(metaStore.get([pid, picId]));
        if (record?.place !== 'trash') {
          tx.abort();
          throw new BridgeError('not-found', `No picture ${id} in the trash.`);
        }
        const restored: PictureMetaRecord = { ...record, place: 'gallery' };
        metaStore.put(restored);
        await done(tx);
        return toSummary(restored);
      },

      async purge(profileId, id) {
        const pid = requireId(profileId, 'profileId');
        const picId = requireId(id, 'id');
        const tx = await transaction([PICTURE_META, PICTURE_BLOBS], 'readwrite');
        const metaStore = tx.objectStore(PICTURE_META);
        const record = await request<PictureMetaRecord | undefined>(metaStore.get([pid, picId]));
        if (record?.place !== 'trash') {
          tx.abort();
          throw new BridgeError('not-found', `No picture ${id} in the trash.`);
        }
        metaStore.delete([pid, picId]);
        const blobStore = tx.objectStore(PICTURE_BLOBS);
        blobStore.delete([pid, picId, 'picture']);
        blobStore.delete([pid, picId, 'thumbnail']);
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
