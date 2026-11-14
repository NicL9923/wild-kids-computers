// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

/** Shows the viewer over a gallery whose reads answer only when the test says, newest read first. */
function showViewer() {
  const answers: Array<(result: BridgeResult<Uint8Array>) => void> = [];
  const { kit } = fakeLessonKit();
  const slowKit = {
    ...kit,
    pictures: {
      ...kit.pictures,
      read: () => new Promise<BridgeResult<Uint8Array>>((resolve) => answers.push(resolve)),
    },
  };
  render(<LessonDesktop level={{ desktop }} band='band-6-8' kit={slowKit} steps={[{ done: () => false }]} />);
  return { answer: (result: BridgeResult<Uint8Array>) => answers.at(-1)?.(result), reads: () => answers.length };
}

/** Opens Kite again through the viewer's own Open dialog. */
function openKiteAgain(): void {
  fireEvent.click(screen.getByRole('button', { name: strings.openPicture.text }));
  const kite = document.querySelector('[data-dialog-item="Kite"]');
  if (kite === null) throw new Error('The open dialog does not list Kite.');
  fireEvent.click(kite);
  const confirm = document.querySelector('[data-dialog-action="confirm"]');
  if (confirm === null) throw new Error('The open dialog has no confirm button.');
  fireEvent.click(confirm);
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

  it('reads the painting again when the child opens the same picture after the deadline', async () => {
    const gallery = showViewer();
    await advance(GALLERY_READ_DEADLINE_MS);
    expect(screen.getByText(strings.noPicture.text)).toBeDefined();

    openKiteAgain();
    await advance(0);
    expect(gallery.reads()).toBe(2);
    gallery.answer({ ok: true, value: new Uint8Array([1, 2, 3]) });
    await advance(0);
    expect(screen.getByRole('img', { name: 'Kite' }).getAttribute('src')).toBe('blob:kite');
  });

  it('shows the painting when the gallery answers in time', async () => {
    const gallery = showViewer();
    gallery.answer({ ok: true, value: new Uint8Array([1, 2, 3]) });
    await advance(0);
    expect(screen.getByRole('img', { name: 'Kite' }).getAttribute('src')).toBe('blob:kite');
  });
});
