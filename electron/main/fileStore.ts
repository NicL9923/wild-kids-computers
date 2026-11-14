import { randomUUID } from 'node:crypto';
import { access, copyFile, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  BridgeError,
  type DocumentStore,
  type PictureFile,
  type PictureStore,
  type PictureSummary,
  type SavePictureInput,
} from '../../src/core/platform/bridge.ts';
import {
  hasPngSignature,
  MAX_DOCUMENT_BYTES,
  MAX_PICTURE_BYTES,
  MAX_THUMBNAIL_BYTES,
  utf8ByteLength,
} from '../../src/core/platform/limits.ts';
import {
  documentFileSegments,
  isSafeId,
  parseDocumentName,
  pictureDirSegments,
  profileDirSegments,
  setAsideFileName,
  type DocumentName,
  type PicturePlace,
} from '../../src/core/platform/names.ts';
import { errorCode, KeyedQueue, writeFileAtomic } from './atomicWrite.ts';

export interface FileStoreOptions {
  now?: () => number;
  newId?: () => string;
}

const PICTURE_SUFFIX = '.png';
const THUMBNAIL_SUFFIX = '.thumb.png';

/**
 * Documents and pictures as files under one root directory. Every path comes from
 * src/core/platform/names.ts and passes a final check that it stays inside the root, so no
 * argument from the renderer is ever used as a path.
 */
export function createFileStore(rootDir: string, options: FileStoreOptions = {}) {
  const root = path.resolve(rootDir);
  const now = options.now ?? Date.now;
  const newId = options.newId ?? randomUUID;
  const queue = new KeyedQueue();

  function inside(segments: string[]): string {
    const resolved = path.resolve(root, ...segments);
    if (!resolved.startsWith(root + path.sep)) {
      throw new BridgeError('invalid-argument', 'The path leaves the data directory.');
    }
    return resolved;
  }

  function documentPath(name: DocumentName): string {
    const parsed = parseDocumentName(name);
    if (parsed === null) throw new BridgeError('invalid-argument', `Unknown document name ${JSON.stringify(name)}.`);
    return inside(documentFileSegments(parsed));
  }

  function pictureDir(profileId: string, place: PicturePlace): string {
    return inside(pictureDirSegments(requireId(profileId, 'profileId'), place));
  }

  function pictureFiles(profileId: string, place: PicturePlace, id: string): Record<PictureFile, string> {
    const dir = pictureDir(profileId, place);
    requireId(id, 'id');
    return { picture: path.join(dir, `${id}${PICTURE_SUFFIX}`), thumbnail: path.join(dir, `${id}${THUMBNAIL_SUFFIX}`) };
  }

  async function requirePicture(profileId: string, place: PicturePlace, id: string) {
    const files = pictureFiles(profileId, place, id);
    if (!(await exists(files.picture))) {
      throw new BridgeError('not-found', `No picture ${id} in the ${place}.`);
    }
    return files;
  }

  async function move(profileId: string, id: string, from: PicturePlace, to: PicturePlace): Promise<string> {
    const source = await requirePicture(profileId, from, id);
    const target = pictureFiles(profileId, to, id);
    await mkdir(path.dirname(target.picture), { recursive: true });
    // Thumbnail first: a picture file without its thumbnail still lists, the reverse does not.
    await rename(source.thumbnail, target.thumbnail).catch((error: unknown) => {
      if (errorCode(error) !== 'ENOENT') throw error;
    });
    await rename(source.picture, target.picture);
    return target.picture;
  }

  const documents: DocumentStore = {
    async read(name) {
      const file = documentPath(name);
      let info;
      try {
        info = await stat(file);
      } catch (error) {
        if (errorCode(error) === 'ENOENT') return null;
        throw error;
      }
      if (info.size > MAX_DOCUMENT_BYTES) {
        throw new BridgeError('too-large', `The saved ${name} document is over ${MAX_DOCUMENT_BYTES} bytes.`);
      }
      return readFile(file, 'utf8');
    },

    async write(name, text) {
      const file = documentPath(name);
      if (utf8ByteLength(text) > MAX_DOCUMENT_BYTES) {
        throw new BridgeError('too-large', `The ${name} document is over ${MAX_DOCUMENT_BYTES} bytes.`);
      }
      await queue.run(file, () => writeFileAtomic(file, text));
    },

    async setAside(name) {
      const file = documentPath(name);
      return queue.run(file, async () => {
        if (!(await exists(file))) return false;
        const stamp = now();
        let attempt = 0;
        let target = path.join(path.dirname(file), setAsideFileName(path.basename(file), stamp));
        while (await exists(target)) {
          attempt += 1;
          target = path.join(path.dirname(file), setAsideFileName(path.basename(file), stamp, attempt));
        }
        await rename(file, target);
        return true;
      });
    },

    async removeProfile(profileId) {
      const dir = inside(profileDirSegments(requireId(profileId, 'profileId')));
      await queue.run(dir, () => rm(dir, { recursive: true, force: true }));
    },
  };

  const pictures: PictureStore = {
    async save(profileId, input: SavePictureInput) {
      checkPng(input.png, MAX_PICTURE_BYTES, 'picture');
      checkPng(input.thumbnail, MAX_THUMBNAIL_BYTES, 'thumbnail');
      const dir = pictureDir(profileId, 'gallery');
      return queue.run(dir, async () => {
        const id = input.id ?? newId();
        const files =
          input.id === undefined
            ? pictureFiles(profileId, 'gallery', id)
            : await requirePicture(profileId, 'gallery', id);
        await writeFileAtomic(files.thumbnail, input.thumbnail);
        await writeFileAtomic(files.picture, input.png);
        return summary(files.picture, id);
      });
    },

    async list(profileId, place) {
      const dir = pictureDir(profileId, place);
      let names: string[];
      try {
        names = await readdir(dir);
      } catch (error) {
        if (errorCode(error) === 'ENOENT') return [];
        throw error;
      }
      const ids = names
        .filter((name) => name.endsWith(PICTURE_SUFFIX) && !name.endsWith(THUMBNAIL_SUFFIX))
        .map((name) => name.slice(0, -PICTURE_SUFFIX.length))
        .filter((id) => isSafeId(id));
      const summaries = await Promise.all(ids.map((id) => summary(path.join(dir, `${id}${PICTURE_SUFFIX}`), id)));
      return summaries.toSorted((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    },

    async read(profileId, id, file) {
      for (const place of ['gallery', 'trash'] as const) {
        const target = pictureFiles(profileId, place, id)[file];
        try {
          return new Uint8Array(await readFile(target));
        } catch (error) {
          if (errorCode(error) !== 'ENOENT') throw error;
        }
      }
      throw new BridgeError('not-found', `No ${file} for picture ${id}.`);
    },

    async copy(profileId, id) {
      const dir = pictureDir(profileId, 'gallery');
      return queue.run(dir, async () => {
        const source = await requirePicture(profileId, 'gallery', id);
        const copyId = newId();
        const target = pictureFiles(profileId, 'gallery', copyId);
        await copyFile(source.thumbnail, target.thumbnail).catch((error: unknown) => {
          if (errorCode(error) !== 'ENOENT') throw error;
        });
        await copyFile(source.picture, target.picture);
        return summary(target.picture, copyId);
      });
    },

    async trash(profileId, id) {
      await queue.run(pictureDir(profileId, 'gallery'), () => move(profileId, id, 'gallery', 'trash'));
    },

    async restore(profileId, id) {
      return queue.run(pictureDir(profileId, 'gallery'), async () => {
        const file = await move(profileId, id, 'trash', 'gallery');
        return summary(file, id);
      });
    },

    async purge(profileId, id) {
      await queue.run(pictureDir(profileId, 'gallery'), async () => {
        const files = await requirePicture(profileId, 'trash', id);
        await rm(files.thumbnail, { force: true });
        await rm(files.picture, { force: true });
      });
    },
  };

  return { root, documents, pictures };
}

function requireId(value: string, label: string): string {
  if (!isSafeId(value)) throw new BridgeError('invalid-argument', `${label} is not a safe id.`);
  return value;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function summary(file: string, id: string): Promise<PictureSummary> {
  const info = await stat(file);
  return { id, updatedAt: Math.floor(info.mtimeMs) };
}

function checkPng(bytes: Uint8Array, max: number, label: string): void {
  if (bytes.length > max) throw new BridgeError('too-large', `The ${label} is over ${max} bytes.`);
  if (!hasPngSignature(bytes)) throw new BridgeError('invalid-argument', `The ${label} is not a PNG file.`);
}
