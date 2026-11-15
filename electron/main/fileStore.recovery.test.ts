import type * as FsPromises from 'node:fs/promises';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PicturePlace } from '../../src/core/platform/names.ts';
import { createFileStore } from './fileStore.ts';

/**
 * A picture and its thumbnail are two files, so saving or moving them takes more than one step
 * on disk. These tests stop the store at each step in turn, either with a write error or by
 * never finishing, as a crash would, and check what a gallery listing shows afterwards.
 */
const fault = vi.hoisted(() => {
  const state = {
    steps: 0,
    at: 0,
    mode: 'error' as 'error' | 'crash',
    async step(): Promise<void> {
      state.steps += 1;
      if (state.steps !== state.at) return;
      if (state.mode === 'crash') await new Promise<never>(() => undefined);
      throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
    },
  };
  return state;
});

vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof FsPromises>();
  return {
    ...real,
    // Creating a new file and renaming are the steps that change what is on disk.
    open: async (...args: Parameters<typeof real.open>) => {
      if (args[1] === 'wx') await fault.step();
      return real.open(...args);
    },
    rename: async (...args: Parameters<typeof real.rename>) => {
      await fault.step();
      return real.rename(...args);
    },
  };
});

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** A picture and its thumbnail carry the same marker byte, so a mismatched pair shows. */
const png = (marker: number) => Uint8Array.from([...SIGNATURE, marker]);
const pair = (marker: number) => ({ png: png(marker), thumbnail: png(marker + 100) });
const markerOf = (bytes: Uint8Array) => bytes.at(-1);

let root: string;
let ids: string[];

function store() {
  return createFileStore(root, { newId: () => ids.shift() ?? 'out-of-ids' });
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'wkc-recovery-'));
  ids = ['pic-a', 'pic-b'];
  fault.steps = 0;
  fault.at = 0;
});

afterEach(async () => {
  fault.at = 0;
  await rm(root, { recursive: true, force: true });
});

/** Every listed picture with the markers of its picture and thumbnail. */
async function shown(place: PicturePlace, pictures = store().pictures) {
  const listed = await pictures.list('p1', place);
  return Promise.all(
    listed.map(async ({ id }) => ({
      id,
      picture: markerOf(await pictures.read('p1', id, 'picture')),
      thumbnail: (markerOf(await pictures.read('p1', id, 'thumbnail')) ?? 0) - 100,
    })),
  );
}

/** Runs `operation` with a fault at each step in turn until it finishes with no fault reached. */
async function atEveryStep(
  mode: 'error' | 'crash',
  prepare: () => Promise<void>,
  operation: (pictures: ReturnType<typeof store>['pictures']) => Promise<unknown>,
  check: () => Promise<void>,
): Promise<number> {
  for (let at = 1; ; at += 1) {
    await rm(root, { recursive: true, force: true });
    ids = ['pic-a', 'pic-b'];
    fault.at = 0;
    await prepare();
    const { pictures } = store();
    fault.steps = 0;
    fault.at = at;
    fault.mode = mode;
    const pending = operation(pictures).then(
      () => 'done' as const,
      () => 'failed' as const,
    );
    // A crash never settles, so wait until the store has reached the stalled step. An error does
    // settle, so wait for it. Neither waits on a fixed delay, which a busy machine can outlast.
    let settled = false;
    const reachedStall = new Promise<'stalled'>((resolve) => {
      const look = (): void => {
        if (settled) return;
        if (fault.steps >= at) resolve('stalled');
        else setTimeout(look, 2);
      };
      look();
    });
    const outcome = await (mode === 'crash' ? Promise.race([pending, reachedStall]) : pending);
    settled = true;
    const stopped = fault.steps >= at;
    fault.at = 0;
    const stoppedOutcome = mode === 'crash' ? 'stalled' : 'failed';
    expect(outcome).toBe(stopped ? stoppedOutcome : 'done');
    if (!stopped) return at - 1;
    await check();
  }
}

describe.each(['error', 'crash'] as const)('a picture save stopped by a %s at any step', (mode) => {
  it('lists the old picture with its old thumbnail, or the new one with its new thumbnail', async () => {
    const steps = await atEveryStep(
      mode,
      async () => {
        await store().pictures.save('p1', pair(1));
      },
      (pictures) => pictures.save('p1', { id: 'pic-a', ...pair(2) }),
      async () => {
        // After an error the same store goes on; after a crash the app starts again.
        const [item] = await shown('gallery');
        expect(item?.id).toBe('pic-a');
        expect(item?.thumbnail).toBe(item?.picture);
        expect((await readdir(path.join(root, 'profile', 'p1', 'pictures'))).toSorted()).toEqual([
          'pic-a.png',
          'pic-a.thumb.png',
        ]);
      },
    );
    expect(steps).toBeGreaterThan(2);
  });

  it('lists a new picture with its thumbnail or not at all', async () => {
    await atEveryStep(
      mode,
      async () => undefined,
      (pictures) => pictures.save('p1', pair(3)),
      async () => {
        const items = await shown('gallery');
        for (const item of items) expect(item.thumbnail).toBe(item.picture);
      },
    );
  });

  it('keeps a copy and its thumbnail together', async () => {
    await atEveryStep(
      mode,
      async () => {
        await store().pictures.save('p1', pair(4));
      },
      (pictures) => pictures.copy('p1', 'pic-a'),
      async () => {
        const items = await shown('gallery');
        expect(items.map((item) => item.id)).toContain('pic-a');
        for (const item of items) expect(item.thumbnail).toBe(item.picture);
      },
    );
  });

  it.each([
    ['trash', 'gallery', 'trash'],
    ['restore', 'trash', 'gallery'],
  ] as const)('keeps a picture moved by %s with its thumbnail', async (action, from, to) => {
    await atEveryStep(
      mode,
      async () => {
        const { pictures } = store();
        await pictures.save('p1', pair(5));
        if (from === 'trash') await pictures.trash('p1', 'pic-a');
      },
      (pictures) => pictures[action]('p1', 'pic-a'),
      async () => {
        const { pictures } = store();
        const items = [...(await shown(from, pictures)), ...(await shown(to, pictures))];
        expect(items).toEqual([{ id: 'pic-a', picture: 5, thumbnail: 5 }]);
      },
    );
  });
});
