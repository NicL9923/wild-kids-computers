import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, open, readdir, rename, rm } from 'node:fs/promises';
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
 * argument from the renderer is ever used as a path. Nothing below the root may be a link:
 * the renderer cannot make one, but another program or a restored backup can, and following
 * it would read or overwrite a file outside the data directory.
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

  /**
   * Resolves to `target` when no existing part of it below the root is a link, so its real
   * location is the one its name says. Parts that do not exist yet are fine: the store makes
   * them as plain directories and files. libuv reports a Windows junction as a link too.
   */
  async function unlinked(target: string): Promise<string> {
    let current = root;
    for (const part of path.relative(root, target).split(path.sep)) {
      current = path.join(current, part);
      const info = await fileInfo(current);
      if (info === null) break;
      if (info.isSymbolicLink()) throw linkError();
    }
    return target;
  }

  function documentPath(name: DocumentName): Promise<string> {
    const parsed = parseDocumentName(name);
    if (parsed === null) throw new BridgeError('invalid-argument', `Unknown document name ${JSON.stringify(name)}.`);
    return unlinked(inside(documentFileSegments(parsed)));
  }

  function pictureDirName(profileId: string, place: PicturePlace): string {
    return inside(pictureDirSegments(requireId(profileId, 'profileId'), place));
  }

  async function pictureFiles(
    profileId: string,
    place: PicturePlace,
    id: string,
  ): Promise<Record<PictureFile, string>> {
    const dir = pictureDirName(profileId, place);
    requireId(id, 'id');
    const files = {
      picture: path.join(dir, `${id}${PICTURE_SUFFIX}`),
      thumbnail: path.join(dir, `${id}${THUMBNAIL_SUFFIX}`),
    };
    await Promise.all([unlinked(files.picture), unlinked(files.thumbnail)]);
    return files;
  }

  async function requirePicture(profileId: string, place: PicturePlace, id: string) {
    const files = await pictureFiles(profileId, place, id);
    if ((await fileInfo(files.picture)) === null) {
      throw new BridgeError('not-found', `No picture ${id} in the ${place}.`);
    }
    return files;
  }

  async function move(profileId: string, id: string, from: PicturePlace, to: PicturePlace): Promise<string> {
    const source = await requirePicture(profileId, from, id);
    const target = await pictureFiles(profileId, to, id);
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
      const file = await documentPath(name);
      const info = await fileInfo(file);
      if (info === null) return null;
      if (info.size > MAX_DOCUMENT_BYTES) {
        throw new BridgeError('too-large', `The saved ${name} document is over ${MAX_DOCUMENT_BYTES} bytes.`);
      }
      // The file can grow between the size check and the read, so the read is capped as well.
      const bytes = await readCapped(file, MAX_DOCUMENT_BYTES, `saved ${name} document`);
      return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length).toString('utf8');
    },

    async write(name, text) {
      const file = await documentPath(name);
      if (utf8ByteLength(text) > MAX_DOCUMENT_BYTES) {
        throw new BridgeError('too-large', `The ${name} document is over ${MAX_DOCUMENT_BYTES} bytes.`);
      }
      await queue.run(file, () => writeFileAtomic(file, text));
    },

    async setAside(name) {
      const file = await documentPath(name);
      return queue.run(file, async () => {
        if ((await fileInfo(file)) === null) return false;
        const stamp = now();
        let attempt = 0;
        let target = path.join(path.dirname(file), setAsideFileName(path.basename(file), stamp));
        while ((await fileInfo(target)) !== null) {
          attempt += 1;
          target = path.join(path.dirname(file), setAsideFileName(path.basename(file), stamp, attempt));
        }
        await rename(file, target);
        return true;
      });
    },

    async removeProfile(profileId) {
      const dir = await unlinked(inside(profileDirSegments(requireId(profileId, 'profileId'))));
      await queue.run(dir, () => rm(dir, { recursive: true, force: true }));
    },
  };

  const pictures: PictureStore = {
    async save(profileId, input: SavePictureInput) {
      checkPng(input.png, MAX_PICTURE_BYTES, 'picture');
      checkPng(input.thumbnail, MAX_THUMBNAIL_BYTES, 'thumbnail');
      const dir = pictureDirName(profileId, 'gallery');
      return queue.run(dir, async () => {
        const id = input.id ?? newId();
        const files =
          input.id === undefined
            ? await pictureFiles(profileId, 'gallery', id)
            : await requirePicture(profileId, 'gallery', id);
        await writeFileAtomic(files.thumbnail, input.thumbnail);
        await writeFileAtomic(files.picture, input.png);
        return summary(files.picture, id);
      });
    },

    async list(profileId, place) {
      const dir = await unlinked(pictureDirName(profileId, place));
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
      const summaries = await Promise.all(ids.map((id) => listed(path.join(dir, `${id}${PICTURE_SUFFIX}`), id)));
      return summaries
        .filter((item) => item !== null)
        .toSorted((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    },

    async read(profileId, id, file) {
      for (const place of ['gallery', 'trash'] as const) {
        const target = (await pictureFiles(profileId, place, id))[file];
        let bytes: Uint8Array;
        try {
          bytes = await readCapped(
            target,
            file === 'picture' ? MAX_PICTURE_BYTES : MAX_THUMBNAIL_BYTES,
            `saved ${file}`,
          );
        } catch (error) {
          if (errorCode(error) === 'ENOENT') continue;
          throw error;
        }
        if (!hasPngSignature(bytes))
          throw new BridgeError('io', `The saved ${file} for picture ${id} is not a PNG file.`);
        return bytes;
      }
      throw new BridgeError('not-found', `No ${file} for picture ${id}.`);
    },

    async copy(profileId, id) {
      const dir = pictureDirName(profileId, 'gallery');
      return queue.run(dir, async () => {
        const source = await requirePicture(profileId, 'gallery', id);
        const copyId = newId();
        const target = await pictureFiles(profileId, 'gallery', copyId);
        await copyFile(source.thumbnail, target.thumbnail).catch((error: unknown) => {
          if (errorCode(error) !== 'ENOENT') throw error;
        });
        await copyFile(source.picture, target.picture);
        return summary(target.picture, copyId);
      });
    },

    async trash(profileId, id) {
      await queue.run(pictureDirName(profileId, 'gallery'), () => move(profileId, id, 'gallery', 'trash'));
    },

    async restore(profileId, id) {
      return queue.run(pictureDirName(profileId, 'gallery'), async () => {
        const file = await move(profileId, id, 'trash', 'gallery');
        return summary(file, id);
      });
    },

    async purge(profileId, id) {
      await queue.run(pictureDirName(profileId, 'gallery'), async () => {
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

function linkError(): BridgeError {
  return new BridgeError('forbidden', 'The data directory holds a link, which the app does not follow.');
}

/** The file's own details without following a link, or null when nothing is there. */
async function fileInfo(file: string) {
  try {
    return await lstat(file);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  }
}

async function summary(file: string, id: string): Promise<PictureSummary> {
  const info = await lstat(file);
  return { id, updatedAt: Math.floor(info.mtimeMs) };
}

/** A listed picture, or null for a name that is a link or anything but a plain file. */
async function listed(file: string, id: string): Promise<PictureSummary | null> {
  const info = await fileInfo(file);
  return info?.isFile() === true ? { id, updatedAt: Math.floor(info.mtimeMs) } : null;
}

/** O_NOFOLLOW does not exist on Windows, where Node leaves it undefined. */
const NO_FOLLOW = process.platform === 'win32' ? 0 : constants.O_NOFOLLOW;

/**
 * Reads at most `max` bytes. A file over the cap rejects before its bytes are allocated, and a
 * file that grows during the read rejects once it passes the cap.
 */
async function readCapped(file: string, max: number, label: string): Promise<Uint8Array> {
  const handle = await open(file, constants.O_RDONLY | NO_FOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new BridgeError('io', `The ${label} is not a file.`);
    if (info.size > max) throw new BridgeError('too-large', `The ${label} is over ${max} bytes.`);
    let buffer = new Uint8Array(Math.min(info.size, max) + 1);
    let length = 0;
    for (;;) {
      if (length === buffer.length) {
        // The file grew after the size check. One byte past the cap is enough to refuse it.
        if (length > max) throw new BridgeError('too-large', `The ${label} is over ${max} bytes.`);
        const larger = new Uint8Array(Math.min(buffer.length * 2, max + 1));
        larger.set(buffer);
        buffer = larger;
      }
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (bytesRead === 0) return buffer.subarray(0, length);
      length += bytesRead;
    }
  } finally {
    await handle.close();
  }
}

function checkPng(bytes: Uint8Array, max: number, label: string): void {
  if (bytes.length > max) throw new BridgeError('too-large', `The ${label} is over ${max} bytes.`);
  if (!hasPngSignature(bytes)) throw new BridgeError('invalid-argument', `The ${label} is not a PNG file.`);
}
