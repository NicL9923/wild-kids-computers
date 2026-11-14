import { useEffect, useState } from 'react';
import { withDeadline } from '../../../../core/activityKit/deadline.ts';
import { systemScheduler } from '../../../../core/activityKit/scheduler.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import type { DesktopAction } from '../../model/desktop.ts';
import { getNode } from '../../model/fileSystem.ts';
import { isCommandEnabled } from '../../model/menus.ts';
import type { PictureViewerState } from '../../model/state.ts';
import { toyClipboard } from '../../../../app/inputGuards.ts';
import { useDesktopContext, type DesktopKit } from '../desktopContext.ts';
import { ControlGlyph } from '../glyphs.tsx';
import { pictureSource } from '../labels.ts';
import { strings } from '../strings.ts';

/**
 * How long reading a painting may take before the viewer gives up on it, in milliseconds. One PNG
 * read takes well under a second on a slow laptop, and the child looks at an empty frame meanwhile.
 */
export const GALLERY_READ_DEADLINE_MS = 5_000;

/** Real time: a test that pins the kit clock cannot stop the deadline. */
const realTime = systemScheduler();

/** A painting from the gallery: loading, shown from an image URL, gone, or not read in time. */
type GalleryPicture =
  | { status: 'loading' }
  | { status: 'shown'; url: string }
  | { status: 'gone' }
  | { status: 'timed-out' };

/**
 * Reads a painting from the child's gallery while a picture viewer shows it. A read that does not
 * answer within GALLERY_READ_DEADLINE_MS is given up, and its late answer is dropped. A new
 * `attempt` reads the same painting again.
 */
function useGalleryPicture(
  pictures: DesktopKit['pictures'],
  pictureId: string | null,
  attempt: number,
): GalleryPicture {
  const [loaded, setLoaded] = useState<{ pictureId: string; attempt: number; picture: GalleryPicture } | null>(null);
  useEffect(() => {
    if (pictureId === null) return undefined;
    let cancelled = false;
    let made: string | null = null;
    const read = async () => {
      let picture: GalleryPicture;
      try {
        const result = await withDeadline(
          pictures.read(pictureId, 'picture'),
          GALLERY_READ_DEADLINE_MS,
          realTime,
          'Reading the painting',
        );
        if (cancelled) return;
        made = result.ok ? URL.createObjectURL(new Blob([result.value.slice()], { type: 'image/png' })) : null;
        picture = made === null ? { status: 'gone' } : { status: 'shown', url: made };
      } catch {
        picture = { status: 'timed-out' };
      }
      if (!cancelled) setLoaded({ pictureId, attempt, picture });
    };
    void read();
    return () => {
      cancelled = true;
      if (made !== null) URL.revokeObjectURL(made);
    };
  }, [pictures, pictureId, attempt]);
  if (loaded === null || loaded.pictureId !== pictureId || loaded.attempt !== attempt) return { status: 'loading' };
  return loaded.picture;
}

/**
 * Whether an action asks for this window's picture: the viewer's own Open dialog confirmed, or
 * the file opened from an icon or a folder, which brings this window forward.
 */
function asksForPicture(action: DesktopAction, windowId: string, fileId: string | null): boolean {
  switch (action.type) {
    case 'dialog':
      return action.windowId === windowId && action.action.type === 'confirm';
    case 'open-file':
      return action.fileId === fileId;
    case 'explorer':
      return action.action.type === 'open-node' && action.action.nodeId === fileId;
    default:
      return false;
  }
}

/** Shows one picture big, with previous and next to step through the pictures in its folder. */
export function PictureViewerApp({ windowId, app }: { readonly windowId: string; readonly app: PictureViewerState }) {
  const { desktop, kit, sayName } = useDesktopContext();
  const { state, dispatch } = desktop;
  const file = getNode(state.fs, app.fileId);
  const source = file?.kind === 'picture' ? pictureSource(file.pictureId) : null;
  // Opening the picture again after its read timed out reads it again. Otherwise the file id is
  // unchanged, and the empty frame would stay.
  const [attempt, setAttempt] = useState(0);
  const gallery = useGalleryPicture(kit.pictures, source?.kind === 'gallery' ? source.pictureId : null, attempt);
  const timedOut = gallery.status === 'timed-out';
  const { listen } = desktop;
  const { fileId } = app;
  useEffect(() => {
    if (!timedOut) return undefined;
    return listen((_transition, action) => {
      if (asksForPicture(action, windowId, fileId)) setAttempt((count) => count + 1);
    });
  }, [listen, windowId, fileId, timedOut]);
  const can = (command: 'previous' | 'next') => isCommandEnabled(state, windowId, command, toyClipboard);

  // A painting that did not come in time leaves the viewer as it is with nothing open, so the
  // child can open a picture again.
  if (file === undefined || source === null || timedOut) {
    return (
      <div className='td-viewer td-viewer-empty'>
        <Emoji id='picture' decorative className='td-viewer-empty-picture' />
        <p>{t(strings.noPicture)}</p>
        <button
          type='button'
          className='wk-button'
          data-variant='primary'
          {...sayName(strings.openPicture)}
          onClick={() => dispatch({ type: 'command', windowId, command: 'open' })}
        >
          {t(strings.openPicture)}
        </button>
      </div>
    );
  }

  let picture;
  if (source.kind === 'emoji') picture = <Emoji id={source.id} className='td-viewer-picture' />;
  else if (source.kind === 'gallery' && gallery.status === 'shown') {
    picture = <img src={gallery.url} alt={file.name} className='td-viewer-picture td-viewer-painting' />;
  } else if (source.kind === 'gallery' && gallery.status === 'loading') picture = <div className='td-viewer-picture' />;
  else picture = <p className='td-viewer-gone'>{t(strings.pictureGone)}</p>;

  return (
    <div className='td-viewer' data-picture={file.kind === 'picture' ? file.pictureId : ''}>
      <button
        type='button'
        className='td-viewer-step'
        aria-label={t(strings.previous)}
        disabled={!can('previous')}
        data-viewer-step='previous'
        {...sayName(strings.previous)}
        onClick={() => dispatch({ type: 'command', windowId, command: 'previous' })}
      >
        <ControlGlyph glyph='previous' />
      </button>
      <figure className='td-viewer-frame'>
        {picture}
        <figcaption className='td-viewer-caption'>{file.name}</figcaption>
      </figure>
      <button
        type='button'
        className='td-viewer-step'
        aria-label={t(strings.next)}
        disabled={!can('next')}
        data-viewer-step='next'
        {...sayName(strings.next)}
        onClick={() => dispatch({ type: 'command', windowId, command: 'next' })}
      >
        <ControlGlyph glyph='next' />
      </button>
    </div>
  );
}
