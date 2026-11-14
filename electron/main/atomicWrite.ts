import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';

/** Windows reports these while an antivirus scanner or indexer briefly holds the target. */
const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RENAME_ATTEMPTS = 5;

/**
 * Runs right before a file system call on a path and throws to refuse it. The file store uses it
 * to confirm the path's folder is still the one it checked.
 */
export type PathCheck = (file: string) => Promise<void>;

/** For a path outside the data directory that an adult chose in a save dialog. */
export const NO_PATH_CHECK: PathCheck = async () => {};

/**
 * Writes a temporary file next to the target, flushes it to disk, and renames it over the
 * target. A crash leaves either the old file or the new one, never half of each. `check` runs
 * on the temporary file before it is created and on both names before the rename.
 */
export async function writeFileAtomic(target: string, data: string | Uint8Array, check: PathCheck): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await check(temporary);
  try {
    const handle = await open(temporary, 'wx');
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameWithRetry(temporary, target, check);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/** Renames, retrying the brief locks Windows scanners hold. `check` runs on both names before each try. */
export async function renameWithRetry(from: string, to: string, check: PathCheck): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    await check(from);
    await check(to);
    try {
      await rename(from, to);
      return;
    } catch (error) {
      if (attempt >= RENAME_ATTEMPTS || !RETRYABLE_RENAME_CODES.has(errorCode(error))) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 20));
    }
  }
}

export function errorCode(error: unknown): string {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : '';
}

/**
 * Runs operations on the same key one after another, so two writes to one file land in the
 * order they were called. Operations on different keys run concurrently.
 */
export class KeyedQueue {
  readonly #tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#tails.get(key) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const tail = result.catch(() => undefined);
    this.#tails.set(key, tail);
    void tail.finally(() => {
      if (this.#tails.get(key) === tail) this.#tails.delete(key);
    });
    return result;
  }
}
