// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeResult } from '../../../../app/session/sessionStore.ts';
import { fakeLessonKit } from '../../lessons/harness/fakeLessonKit.ts';
import { LessonDesktop } from '../../lessons/harness/LessonDesktop.tsx';
import { buildDesktop, picture } from '../../model/build.ts';
import { GALLERY_PICTURE_PREFIX } from '../labels.ts';
import { strings } from '../strings.ts';
import { GALLERY_READ_DEADLINE_MS } from './PictureViewerApp.tsx';

/** A viewer showing one of the child's paintings. */
const desktop = buildDesktop({
  files: { Pictures: { Kite: picture(`${GALLERY_PICTURE_PREFIX}p1`) } },
  windows: [{ file: 'Pictures/Kite' }],
});

/** Shows the viewer over a gallery whose read answers only when the test says. */
function showViewer() {
  let answer: ((result: BridgeResult<Uint8Array>) => void) | null = null;
  const { kit } = fakeLessonKit();
  const slowKit = {
    ...kit,
    pictures: {
      ...kit.pictures,
      read: () =>
        new Promise<BridgeResult<Uint8Array>>((resolve) => {
          answer = resolve;
        }),
    },
  };
  render(<LessonDesktop level={{ desktop }} band='band-6-8' kit={slowKit} steps={[{ done: () => false }]} />);
  return { answer: (result: BridgeResult<Uint8Array>) => answer?.(result) };
}

const advance = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });

describe('the picture viewer with a gallery that does not answer', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = () => undefined;
        disconnect = () => undefined;
      },
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:kite');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows its usual empty state with the way to open a picture after the deadline, and ignores the late answer', async () => {
    const gallery = showViewer();
    await advance(GALLERY_READ_DEADLINE_MS - 1);
    expect(screen.queryByText(strings.noPicture.text)).toBeNull();
    await advance(1);
    expect(screen.getByText(strings.noPicture.text)).toBeDefined();
    expect(screen.getByRole('button', { name: strings.openPicture.text })).toBeDefined();

    gallery.answer({ ok: true, value: new Uint8Array([1, 2, 3]) });
    await advance(0);
    expect(screen.getByText(strings.noPicture.text)).toBeDefined();
    expect(screen.queryByRole('img', { name: 'Kite' })).toBeNull();
  });

  it('shows the painting when the gallery answers in time', async () => {
    const gallery = showViewer();
    gallery.answer({ ok: true, value: new Uint8Array([1, 2, 3]) });
    await advance(0);
    expect(screen.getByRole('img', { name: 'Kite' }).getAttribute('src')).toBe('blob:kite');
  });
});
