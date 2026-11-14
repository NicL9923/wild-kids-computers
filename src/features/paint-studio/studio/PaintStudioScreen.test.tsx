// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderShell, savedProfiles, type ShellHarness } from '../../../app/testing/shellHarness.tsx';
import { strings } from '../strings.ts';
import { WORKER_DEADLINES } from '../worker/effectRunner.ts';
import type { EffectRequest } from '../worker/protocol.ts';

/**
 * The studio's way out when its worker goes quiet. The worker, the canvas codecs, and images are
 * the I/O edge here: jsdom has none of them, so each is a small stand-in. Everything else, from the
 * route blocker to the saver and the session store, is the real app.
 */

const fox = { id: 'fox-kid', avatarId: 'fox', colorId: 'sky', band: 'band-6-8' } as const;

/** What this thread's encoder does: answer with a tiny file, or never answer. */
let encodeHere: 'works' | 'hangs' = 'works';

class StubOffscreenCanvas {
  readonly width: number;
  readonly height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return {
      canvas: this,
      putImageData: () => undefined,
      drawImage: () => undefined,
      getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4) }),
    };
  }
  convertToBlob() {
    if (encodeHere === 'hangs') return new Promise(() => undefined);
    return Promise.resolve({ arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer) });
  }
}

class StubImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

/** A worker that answers its warm-up and then never answers again, and counts what it was asked. */
class SilentWorker extends EventTarget {
  static encodes = 0;
  postMessage(request: EffectRequest): void {
    if (request.kind === 'warm') {
      queueMicrotask(() =>
        this.dispatchEvent(new MessageEvent('message', { data: { kind: 'ready', id: request.id } })),
      );
    } else if (request.kind === 'encode') SilentWorker.encodes += 1;
  }
  terminate(): void {}
}

// The studio and the gallery are lazy route modules. Under the full suite with coverage, their
// first transform can take seconds, so they load once here instead of inside a timed test.
beforeAll(async () => {
  await Promise.all([import('../PaintStudio.tsx'), import('../gallery/PaintGallery.tsx')]);
}, 60_000);

beforeEach(() => {
  encodeHere = 'works';
  SilentWorker.encodes = 0;
  vi.stubGlobal('ImageData', StubImageData);
  vi.stubGlobal('OffscreenCanvas', StubOffscreenCanvas);
  vi.stubGlobal('Worker', SilentWorker);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    // jsdom has no 2D canvas. The studio only puts pixels and clears.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    () => ({ putImageData: () => undefined, clearRect: () => undefined }) as unknown as CanvasRenderingContext2D,
  );
  vi.stubGlobal(
    'Image',
    class extends EventTarget {
      naturalWidth = 10;
      naturalHeight = 10;
      set src(_url: string) {
        queueMicrotask(() => this.dispatchEvent(new Event('load')));
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function openStudioAndPaint(): Promise<ShellHarness> {
  const shell = await renderShell('/paint', { documents: savedProfiles([fox], fox.id) });
  await waitFor(() => expect(document.querySelector('[data-ready="true"]')).not.toBeNull());
  const canvas = screen.getByRole('application', { name: strings.canvas.text });
  fireEvent.keyDown(canvas, { key: 'Enter' });
  fireEvent.keyDown(canvas, { key: 'ArrowRight' });
  return shell;
}

describe('leaving the studio while its worker never answers', { timeout: 20_000 }, () => {
  it('saves through this thread once the deadline passes, and leaves', async () => {
    const shell = await openStudioAndPaint();
    vi.useFakeTimers();
    let left = false;
    await act(async () => {
      void shell.router.navigate({ to: '/paint/gallery' }).then(() => (left = true));
      await Promise.resolve();
    });
    await act(() => vi.advanceTimersByTimeAsync(WORKER_DEADLINES.encode - 100));
    expect(left).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(200));
    // The gallery screen loads as its own module, which takes real time.
    vi.useRealTimers();
    await waitFor(() => expect(left).toBe(true));
    expect(SilentWorker.encodes).toBe(1);
    expect(shell.router.state.location.pathname).toBe('/paint/gallery');
    expect(shell.fake.pictureIds(fox.id, 'gallery')).toHaveLength(1);
  });

  it('stays, gives painting back, and says the picture is not saved when this thread cannot encode either', async () => {
    encodeHere = 'hangs';
    const shell = await openStudioAndPaint();
    vi.useFakeTimers();
    await act(async () => {
      void shell.router.navigate({ to: '/paint/gallery' });
      await Promise.resolve();
    });
    const canvas = screen.getByRole('application', { name: strings.canvas.text });
    expect(canvas.getAttribute('aria-busy')).toBe('true');
    await act(() => vi.advanceTimersByTimeAsync(WORKER_DEADLINES.encode + WORKER_DEADLINES.encodeHere + 100));
    expect(shell.router.state.location.pathname).toBe('/paint');
    expect(canvas.getAttribute('aria-busy')).toBe('false');
    expect(screen.getByText(strings.pictureNotSaved.text)).toBeDefined();
    expect(shell.spoken()).toContain(strings.pictureNotSaved.id);
    expect(shell.fake.pictureIds(fox.id, 'gallery')).toEqual([]);
  });
});
