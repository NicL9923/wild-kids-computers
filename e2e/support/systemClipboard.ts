import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { LaunchedApp } from './launchApp.ts';

/**
 * The system clipboard belongs to the display, so parallel test workers on one virtual display
 * share it. A test that writes it and later expects the same text back holds this lock in
 * between, so another worker cannot overwrite it. The lock is a directory, which `mkdir` creates
 * atomically, named for the display so separate displays do not wait for each other. A lock left
 * by a worker that died is taken over.
 */
const LOCK = path.join(os.tmpdir(), `wkc-e2e-clipboard-${(process.env.DISPLAY ?? 'none').replaceAll(/\W/g, '_')}`);
const OWNER = path.join(LOCK, 'owner');
const WAIT_MS = 50;
const GIVE_UP_MS = 60_000;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function acquire(): Promise<void> {
  const deadline = Date.now() + GIVE_UP_MS;
  for (;;) {
    try {
      await mkdir(LOCK);
      await writeFile(OWNER, String(process.pid));
      return;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
    }
    const owner = Number(await readFile(OWNER, 'utf8').catch(() => ''));
    // An owner that is not running any more left the lock behind. A missing owner file is a
    // worker between mkdir and writeFile, so it waits.
    if (owner > 0 && !alive(owner)) await rm(LOCK, { recursive: true, force: true });
    if (Date.now() > deadline) throw new Error(`The system clipboard lock ${LOCK} stayed taken for a minute.`);
    await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
  }
}

/** Runs `body` while no other worker on this display touches the system clipboard. */
export async function withSystemClipboard<T>(body: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await body();
  } finally {
    await rm(LOCK, { recursive: true, force: true });
  }
}

export const readSystemClipboard = (launched: LaunchedApp): Promise<string> =>
  launched.app.evaluate(({ clipboard }) => clipboard.readText());

export const writeSystemClipboard = (launched: LaunchedApp, text: string): Promise<void> =>
  launched.app.evaluate(({ clipboard }, value) => clipboard.writeText(value), text);
