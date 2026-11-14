import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir as readdirUnchecked, realpath, rm as rmUnchecked } from 'node:fs/promises';
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
  profilesDirSegments,
  setAsideFileName,
  type DocumentName,
  type PicturePlace,
} from '../../src/core/platform/names.ts';
import { errorCode, KeyedQueue, renameWithRetry, writeFileAtomic, type PathCheck } from './atomicWrite.ts';

export interface FileStoreOptions {
  now?: () => number;
  newId?: () => string;
}

const PICTURE_SUFFIX = '.png';
const THUMBNAIL_SUFFIX = '.thumb.png';
/** A complete new file waiting to replace the file named before this suffix. */
const STAGED_SUFFIX = '.staged';
/** What writeFileAtomic leaves behind when the app stops during a write. */
const TEMPORARY_SUFFIX = '.tmp';

/**
 * Documents and pictures as files under one root directory. Every path comes from
 * src/core/platform/names.ts and passes a final check that it stays inside the root, so no
 * argument from the renderer is ever used as a path. Nothing below the root may be a link:
 * the renderer cannot make one, but another program or a restored backup can, and following
 * it would read or overwrite a file outside the data directory.
 *
 * Every read, write, rename, and removal goes through `io`, which confirms the folder still
 * resolves to its place under the root right before the call. A program that swaps a checked
 * folder for a link between that check and the call can still win; see "Storage" in
 * docs/decisions.md for why that gap stays open.
 */
export function createFileStore(rootDir: string, options: FileStoreOptions = {}) {
  const root = path.resolve(rootDir);
  const now = options.now ?? Date.now;
  const newId = options.newId ?? randomUUID;
  const queue = new KeyedQueue();
  /** Profiles whose picture folder has had leftovers from an interrupted save cleared. */
  const recovered = new Set<string>();
  /** Where the root really is, fixed at the first check so a later swap of the root shows too. */
  let realRoot: string | undefined;

  /**
   * Refuses when `dir` resolves anywhere but its own place under the root, which means a folder
   * on its way became a link after the store checked it. A folder that does not exist yet is
   * fine: the call that follows makes it, or fails.
   */
  async function confirmDir(dir: string): Promise<void> {
    let actual: string;
    try {
      actual = await realpath(dir);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return;
      throw error;
    }
    realRoot ??= await realpath(root);
    if (actual !== path.join(realRoot, path.relative(root, dir))) throw linkError();
  }

  const confirmParent: PathCheck = (file) => confirmDir(path.dirname(file));

  /** The only file system calls that read or change the data, each after `confirmDir`. */
  const io: CheckedIo = {
    write: (file, data) => writeFileAtomic(file, data, confirmParent),
    rename: (from, to) => renameWithRetry(from, to, confirmParent),
    async remove(file, { recursive = false } = {}) {
      await confirmParent(file);
      await rmUnchecked(file, { recursive, force: true });
    },
    async list(dir) {
      await confirmDir(dir);
      return readdirUnchecked(dir);
    },
    async read(file, max, label) {
      await confirmParent(file);
      return readCappedUnchecked(file, max, label);
    },
  };

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

  /**
   * The file of a document. Synchronous, so a read or write joins its file's queue in call order;
   * the link check runs inside the queued operation.
   */
  function documentPath(name: DocumentName): string {
    const parsed = parseDocumentName(name);
    if (parsed === null) throw new BridgeError('invalid-argument', `Unknown document name ${JSON.stringify(name)}.`);
    return inside(documentFileSegments(parsed));
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
    await io.rename(source.thumbnail, target.thumbnail).catch((error: unknown) => {
      if (errorCode(error) !== 'ENOENT') throw error;
    });
    await io.rename(source.picture, target.picture);
    return target.picture;
  }

  /**
   * Clears what an interrupted save or copy left in a profile's gallery folder: a staged
   * thumbnail whose picture already committed is renamed into place, staged files of a save that
   * never reached its commit are removed, and so are temporary files. Runs inside the gallery
   * queue, so no save of this process is in flight.
   */
  async function recoverPictures(profileId: string): Promise<void> {
    if (recovered.has(profileId)) return;
    const dir = await unlinked(pictureDirName(profileId, 'gallery'));
    let names: string[];
    try {
      names = await io.list(dir);
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
      names = [];
    }
    const present = new Set(names);
    for (const name of names) {
      if (name.endsWith(TEMPORARY_SUFFIX)) await io.remove(path.join(dir, name));
    }
    for (const name of names) {
      if (!name.endsWith(PICTURE_SUFFIX + STAGED_SUFFIX) || name.endsWith(THUMBNAIL_SUFFIX + STAGED_SUFFIX)) continue;
      const id = name.slice(0, -(PICTURE_SUFFIX + STAGED_SUFFIX).length);
      await discardStaged(io, {
        picture: path.join(dir, name),
        thumbnail: path.join(dir, `${id}${THUMBNAIL_SUFFIX}${STAGED_SUFFIX}`),
      });
      present.delete(`${id}${THUMBNAIL_SUFFIX}${STAGED_SUFFIX}`);
    }
    for (const name of present) {
      if (!name.endsWith(THUMBNAIL_SUFFIX + STAGED_SUFFIX)) continue;
      const file = path.join(dir, name);
      await unlinked(file);
      await io.rename(file, file.slice(0, -STAGED_SUFFIX.length));
    }
    recovered.add(profileId);
  }

  /** Runs a picture operation in the profile's queue, after recovery, and recovers again after a failure. */
  async function inPictureQueue<T>(profileId: string, operation: () => Promise<T>): Promise<T> {
    return queue.run(pictureDirName(profileId, 'gallery'), async () => {
      await recoverPictures(profileId);
      try {
        return await operation();
      } catch (error) {
        recovered.delete(profileId);
        throw error;
      }
    });
  }

  const documents: DocumentStore = {
    async read(name) {
      const file = documentPath(name);
      // In the file's queue, so a read never passes a write called before it, even one the
      // renderer stopped waiting for.
      return queue.run(file, async () => {
        await unlinked(file);
        const info = await fileInfo(file);
        if (info === null) return null;
        if (info.size > MAX_DOCUMENT_BYTES) {
          throw new BridgeError('too-large', `The saved ${name} document is over ${MAX_DOCUMENT_BYTES} bytes.`);
        }
        // The file can grow between the size check and the read, so the read is capped as well.
        const bytes = await io.read(file, MAX_DOCUMENT_BYTES, `saved ${name} document`);
        return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length).toString('utf8');
      });
    },

    async write(name, text) {
      const file = documentPath(name);
      if (utf8ByteLength(text) > MAX_DOCUMENT_BYTES) {
        throw new BridgeError('too-large', `The ${name} document is over ${MAX_DOCUMENT_BYTES} bytes.`);
      }
      await queue.run(file, async () => io.write(await unlinked(file), text));
    },

    async setAside(name) {
      const file = documentPath(name);
      return queue.run(file, async () => {
        if ((await fileInfo(await unlinked(file))) === null) return false;
        const stamp = now();
        let attempt = 0;
        let target = path.join(path.dirname(file), setAsideFileName(path.basename(file), stamp));
        while ((await fileInfo(target)) !== null) {
          attempt += 1;
          target = path.join(path.dirname(file), setAsideFileName(path.basename(file), stamp, attempt));
        }
        await io.rename(file, target);
        return true;
      });
    },

    async removeProfile(profileId) {
      const dir = inside(profileDirSegments(requireId(profileId, 'profileId')));
      await queue.run(dir, async () => io.remove(await unlinked(dir), { recursive: true }));
    },

    async listProfiles() {
      const dir = await unlinked(inside(profilesDirSegments()));
      let names: string[];
      try {
        names = await io.list(dir);
      } catch (error) {
        if (errorCode(error) === 'ENOENT') return [];
        throw error;
      }
      // Anything else in the folder is not a profile the store made, and no call can name it.
      return names.filter((name) => isSafeId(name)).toSorted();
    },
  };

  const pictures: PictureStore = {
    async save(profileId, input: SavePictureInput) {
      checkPng(input.png, MAX_PICTURE_BYTES, 'picture');
      checkPng(input.thumbnail, MAX_THUMBNAIL_BYTES, 'thumbnail');
      return inPictureQueue(profileId, async () => {
        const id = input.id ?? newId();
        // A save under a known id creates or overwrites that picture, so a retry after an answer
        // that came too late replaces the first save instead of adding a second picture.
        if (input.id !== undefined && (await fileInfo((await pictureFiles(profileId, 'trash', id)).picture)) !== null) {
          throw new BridgeError('not-found', `Picture ${id} is in the trash.`);
        }
        const files = await pictureFiles(profileId, 'gallery', id);
        await commitPair(io, files, input.png, input.thumbnail);
        return summary(files.picture, id);
      });
    },

    list(profileId, place) {
      return inPictureQueue(profileId, async () => {
        const dir = await unlinked(pictureDirName(profileId, place));
        let names: string[];
        try {
          names = await io.list(dir);
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
      });
    },

    read(profileId, id, file) {
      return inPictureQueue(profileId, async () => {
        for (const place of ['gallery', 'trash'] as const) {
          const target = (await pictureFiles(profileId, place, id))[file];
          let bytes: Uint8Array;
          try {
            bytes = await io.read(
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
      });
    },

    async copy(profileId, id) {
      return inPictureQueue(profileId, async () => {
        const source = await requirePicture(profileId, 'gallery', id);
        const png = await io.read(source.picture, MAX_PICTURE_BYTES, 'saved picture');
        const thumbnail = await io
          .read(source.thumbnail, MAX_THUMBNAIL_BYTES, 'saved thumbnail')
          .catch((error: unknown) => {
            if (errorCode(error) === 'ENOENT') return null;
            throw error;
          });
        const copyId = newId();
        const target = await pictureFiles(profileId, 'gallery', copyId);
        await commitPair(io, target, png, thumbnail);
        return summary(target.picture, copyId);
      });
    },

    async trash(profileId, id) {
      await inPictureQueue(profileId, () => move(profileId, id, 'gallery', 'trash'));
    },

    async restore(profileId, id) {
      return inPictureQueue(profileId, async () => {
        const file = await move(profileId, id, 'trash', 'gallery');
        return summary(file, id);
      });
    },

    async purge(profileId, id) {
      await inPictureQueue(profileId, async () => {
        const files = await requirePicture(profileId, 'trash', id);
        await io.remove(files.thumbnail);
        await io.remove(files.picture);
      });
    },
  };

  return { root, documents, pictures };
}

/** File system calls that confirm the path's folder first. See `io` in createFileStore. */
interface CheckedIo {
  write(file: string, data: string | Uint8Array): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /** Removes a file, or a folder with `recursive`. Nothing there is fine. */
  remove(file: string, options?: { recursive?: boolean }): Promise<void>;
  list(dir: string): Promise<string[]>;
  read(file: string, max: number, label: string): Promise<Uint8Array>;
}

function requireId(value: string, label: string): string {
  if (!isSafeId(value)) throw new BridgeError('invalid-argument', `${label} is not a safe id.`);
  return value;
}

/**
 * Writes a picture and its thumbnail so that a crash or failure at any step leaves the old pair
 * or the new pair, never one of each. Both files are staged complete and flushed first. The
 * picture's rename is the commit point: while its staged file exists nothing has changed, and
 * once it is gone the staged thumbnail only needs its rename. `recoverPictures` finishes or
 * discards what a stopped commit left.
 */
async function commitPair(
  io: CheckedIo,
  files: Record<PictureFile, string>,
  png: Uint8Array,
  thumbnail: Uint8Array | null,
) {
  const staged = { picture: files.picture + STAGED_SUFFIX, thumbnail: files.thumbnail + STAGED_SUFFIX };
  try {
    await io.write(staged.picture, png);
    if (thumbnail !== null) await io.write(staged.thumbnail, thumbnail);
    await syncDirectory(path.dirname(files.picture));
  } catch (error) {
    await discardStaged(io, staged);
    throw error;
  }
  try {
    await io.rename(staged.picture, files.picture);
  } catch (error) {
    await discardStaged(io, staged);
    throw error;
  }
  if (thumbnail === null) {
    await io.remove(files.thumbnail);
    return;
  }
  await syncDirectory(path.dirname(files.picture));
  await io.rename(staged.thumbnail, files.thumbnail);
}

/** Removes staged files, the thumbnail first, so a stop halfway still reads as "never committed". */
async function discardStaged(io: CheckedIo, staged: Record<PictureFile, string>): Promise<void> {
  await io.remove(staged.thumbnail);
  await io.remove(staged.picture);
}

/**
 * Flushes a directory's entries, so a rename is on disk before the next one. Windows cannot
 * open a directory for this and orders its own metadata writes, so it skips the flush. It
 * reads and changes no data, so it needs no folder check.
 */
async function syncDirectory(dir: string): Promise<void> {
  if (process.platform === 'win32') return;
  const handle = await open(dir, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
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
 * file that grows during the read rejects once it passes the cap. The store calls it through
 * `io.read`, which checks the folder first.
 */
async function readCappedUnchecked(file: string, max: number, label: string): Promise<Uint8Array> {
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
