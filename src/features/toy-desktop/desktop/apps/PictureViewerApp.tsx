import { useEffect, useState } from 'react';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { getNode } from '../../model/fileSystem.ts';
import { isCommandEnabled } from '../../model/menus.ts';
import type { PictureViewerState } from '../../model/state.ts';
import { toyClipboard } from '../../../../app/inputGuards.ts';
import { useDesktopContext, type DesktopKit } from '../desktopContext.ts';
import { ControlGlyph } from '../glyphs.tsx';
import { pictureSource } from '../labels.ts';
import { strings } from '../strings.ts';

/** A painting from the gallery: loading, shown from an image URL, or gone. */
type GalleryPicture = { status: 'loading' } | { status: 'shown'; url: string } | { status: 'gone' };

/** Reads a painting from the child's gallery while a picture viewer shows it. */
function useGalleryPicture(pictures: DesktopKit['pictures'], pictureId: string | null): GalleryPicture {
  const [loaded, setLoaded] = useState<{ pictureId: string; url: string | null } | null>(null);
  useEffect(() => {
    if (pictureId === null) return undefined;
    let cancelled = false;
    let made: string | null = null;
    const read = async () => {
      const result = await pictures.read(pictureId, 'picture');
      if (cancelled) return;
      made = result.ok ? URL.createObjectURL(new Blob([result.value.slice()], { type: 'image/png' })) : null;
      setLoaded({ pictureId, url: made });
    };
    void read();
    return () => {
      cancelled = true;
      if (made !== null) URL.revokeObjectURL(made);
    };
  }, [pictures, pictureId]);
  if (loaded === null || loaded.pictureId !== pictureId) return { status: 'loading' };
  return loaded.url === null ? { status: 'gone' } : { status: 'shown', url: loaded.url };
}

/** Shows one picture big, with previous and next to step through the pictures in its folder. */
export function PictureViewerApp({ windowId, app }: { readonly windowId: string; readonly app: PictureViewerState }) {
  const { desktop, kit, sayName } = useDesktopContext();
  const { state, dispatch } = desktop;
  const file = getNode(state.fs, app.fileId);
  const source = file?.kind === 'picture' ? pictureSource(file.pictureId) : null;
  const gallery = useGalleryPicture(kit.pictures, source?.kind === 'gallery' ? source.pictureId : null);
  const can = (command: 'previous' | 'next') => isCommandEnabled(state, windowId, command, toyClipboard);

  if (file === undefined || source === null) {
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
