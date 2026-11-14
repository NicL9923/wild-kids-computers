// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { BridgeResult } from '../../../../app/session/sessionStore.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import { createManualScheduler } from '../../../../core/activityKit/scheduler.ts';
import type { PictureSummary } from '../../../../core/platform/bridge.ts';
import { generateLevel, type JigsawLevel } from './level.ts';
import { JIGSAW_PICTURE_DEADLINE_MS, useJigsawPicture } from './useJigsawPicture.ts';

const THUMB = { width: 64, height: 40 };

/** Pixels of seeded noise: every piece shows something and no two look alike. */
function noise(): Uint8ClampedArray {
  const random = createRandom(7);
  return Uint8ClampedArray.from({ length: THUMB.width * THUMB.height * 4 }, (_, i) =>
    i % 4 === 3 ? 255 : Math.floor(random.next() * 256),
  );
}

/** The object URLs the hook made, which only a painting it shows needs. */
let madeUrls: MockInstance<typeof URL.createObjectURL>;

// Decoding is the browser's native edge, which jsdom lacks: a stand-in decodes any bytes to noise.
beforeEach(() => {
  vi.stubGlobal('createImageBitmap', () => Promise.resolve({ ...THUMB, close: () => undefined }));
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      readonly width: number;
      readonly height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext() {
        return { drawImage: () => undefined, getImageData: () => ({ data: noise() }) };
      }
    },
  );
  madeUrls = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:painting');
  vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const level: JigsawLevel = { ...generateLevel(3, 1, 'band-3-5'), gallery: 0 };
const listed: BridgeResult<PictureSummary[]> = { ok: true, value: [{ id: 'p1', updatedAt: 1 }] };
const bytes: BridgeResult<Uint8Array> = { ok: true, value: new Uint8Array([1, 2, 3]) };

/** A gallery whose list answers only when the test says. Reads answer at once. */
function slowGallery() {
  let answer: ((result: BridgeResult<PictureSummary[]>) => void) | null = null;
  const pictures = {
    list: () =>
      new Promise<BridgeResult<PictureSummary[]>>((resolve) => {
        answer = resolve;
      }),
    read: () => Promise.resolve(bytes),
  };
  return { pictures, answer: (result: BridgeResult<PictureSummary[]>) => answer?.(result) };
}

/** Lets every pending promise run: the reads and the stand-in decode settle in microtasks. */
const flush = () =>
  act(async () => {
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
  });

describe('the jigsaw picture', () => {
  it('uses a fit painting from the gallery when the gallery answers in time', async () => {
    const timers = createManualScheduler({ wall: 0 });
    const gallery = slowGallery();
    const { result } = renderHook(() => useJigsawPicture({ pictures: gallery.pictures }, level, timers));
    expect(result.current.status).toBe('loading');
    await flush();
    gallery.answer(listed);
    await flush();
    expect(result.current).toMatchObject({ status: 'ready', from: 'gallery' });
  });

  it('falls back to the bundled scene when the gallery does not answer in time, and ignores its late answer', async () => {
    const timers = createManualScheduler({ wall: 0 });
    const gallery = slowGallery();
    const { result } = renderHook(() => useJigsawPicture({ pictures: gallery.pictures }, level, timers));
    await flush();
    await act(async () => timers.advance(JIGSAW_PICTURE_DEADLINE_MS - 1));
    expect(result.current.status).toBe('loading');
    await act(async () => timers.advance(1));
    expect(result.current).toMatchObject({ status: 'ready', from: 'scene' });

    gallery.answer(listed);
    await flush();
    expect(result.current).toMatchObject({ status: 'ready', from: 'scene' });
    expect(madeUrls).not.toHaveBeenCalled();
  });
});
