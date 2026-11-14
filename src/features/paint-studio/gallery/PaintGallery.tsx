import { Navigate, useNavigate } from '@tanstack/react-router';
import { Download, Printer } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBand, usePictures, useSessionStatus } from '../../../app/session/sessionHooks.ts';
import type { ProfilePictures } from '../../../app/session/sessionStore.ts';
import { useAudio, useMute } from '../../../audio/AudioProvider.tsx';
import { IconButton } from '../../../components/ui/IconButton.tsx';
import { InterfaceIcon } from '../../../components/ui/InterfaceIcon.tsx';
import { Screen } from '../../../components/ui/Screen.tsx';
import { t } from '../../../core/strings/defineStrings.ts';
import { getBridge } from '../../../platform/getBridge.ts';
import { useRequestParentGate, type ParentGateReason } from '../parentGate.ts';
import { PAINT_STUDIO_PATH } from '../paths.ts';
import { strings } from '../strings.ts';
import { createStudioScope, type StudioScope } from '../studioScope.ts';
import { EmojiPicture } from '../studio/controls.tsx';
import '../paintStudio.css';

interface GalleryItem {
  readonly id: string;
  readonly updatedAt: number;
  /** An object URL of the thumbnail, revoked when the list changes or the screen closes. */
  readonly url: string;
}

/** How long the "bring it back" control stays after a picture goes in the trash. */
const UNDO_DELETE_MS = 12_000;

/** The gallery's pictures, newest first, each with its thumbnail ready to show. */
async function loadGallery(pictures: ProfilePictures): Promise<GalleryItem[]> {
  const listed = await pictures.list('gallery');
  if (!listed.ok) return [];
  const loaded: GalleryItem[] = [];
  for (const summary of listed.value) {
    const thumbnail = await pictures.read(summary.id, 'thumbnail');
    if (!thumbnail.ok) continue;
    const url = URL.createObjectURL(new Blob([new Uint8Array(thumbnail.value)], { type: 'image/png' }));
    loaded.push({ id: summary.id, updatedAt: summary.updatedAt, url });
  }
  return loaded;
}

/** The active profile's pictures. Pictures belong to a profile, so without one it goes to the start. */
export default function PaintGallery() {
  const status = useSessionStatus();
  if (status === 'loading') return null;
  if (status !== 'ready') return <Navigate to='/' replace />;
  return <GalleryScreen />;
}

function GalleryScreen() {
  const pictures = usePictures();
  const band = useBand();
  const audio = useAudio();
  const [muted, toggleMute] = useMute();
  const navigate = useNavigate();
  const requestParentGate = useRequestParentGate();
  const [items, setItems] = useState<readonly GalleryItem[] | null>(null);
  const [trashed, setTrashed] = useState<string | null>(null);
  const [outputFailed, setOutputFailed] = useState(false);
  const scope = useRef<StudioScope | null>(null);
  const hideUndo = useRef<() => void>(() => undefined);
  const urls = useRef<string[]>([]);

  const show = useCallback((loaded: readonly GalleryItem[]) => {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current = loaded.map((item) => item.url);
    setItems(loaded);
  }, []);

  const refresh = useCallback(async () => show(await loadGallery(pictures)), [pictures, show]);

  useEffect(() => {
    const created = createStudioScope();
    scope.current = created;
    let live = true;
    void (async () => {
      const loaded = await loadGallery(pictures);
      if (live) show(loaded);
      else for (const item of loaded) URL.revokeObjectURL(item.url);
    })();
    return () => {
      live = false;
      created.dispose();
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current = [];
    };
  }, [pictures, show]);

  const open = (id: string): void => {
    audio.play('open');
    void navigate({ to: PAINT_STUDIO_PATH, search: { picture: id } });
  };

  const copy = async (id: string): Promise<void> => {
    audio.play('snap');
    void audio.speak(strings.copyPicture);
    const result = await pictures.copy(id);
    if (result.ok) await refresh();
  };

  const trash = async (id: string): Promise<void> => {
    audio.play('whoosh');
    void audio.speak(strings.pictureGone);
    const result = await pictures.trash(id);
    if (!result.ok) return;
    setTrashed(id);
    hideUndo.current();
    hideUndo.current = scope.current?.setTimeout(() => setTrashed(null), UNDO_DELETE_MS) ?? (() => undefined);
    await refresh();
  };

  const bringBack = async (): Promise<void> => {
    if (trashed === null) return;
    hideUndo.current();
    audio.play('pop');
    void audio.speak(strings.bringBack);
    const result = await pictures.restore(trashed);
    setTrashed(null);
    if (result.ok) await refresh();
  };

  const output = async (id: string, reason: ParentGateReason): Promise<void> => {
    setOutputFailed(false);
    if (!(await requestParentGate(reason))) return;
    const read = await pictures.read(id, 'picture');
    if (!read.ok) {
      setOutputFailed(true);
      return;
    }
    try {
      const bridge = getBridge();
      if (reason === 'export') await bridge.output.exportPicture(read.value, `Wild Kids picture ${id.slice(0, 8)}`);
      else await bridge.output.printPicture(read.value);
    } catch {
      setOutputFailed(true);
    }
  };

  return (
    <div className='wk-paint-screen' data-ready={items === null ? undefined : 'true'}>
      <Screen
        exit={
          <IconButton
            label={t(strings.backToPainting)}
            icon={<InterfaceIcon name='exit' />}
            onClick={() => void navigate({ to: PAINT_STUDIO_PATH })}
          />
        }
        instruction={
          <h1 className='wk-paint-gallery-title'>
            <EmojiPicture id='picture' />
            <span className='wk-reading-text'>{t(strings.galleryTitle)}</span>
          </h1>
        }
        end={
          <IconButton
            label={t(muted ? strings.soundOff : strings.soundOn)}
            icon={<InterfaceIcon name={muted ? 'sound-off' : 'sound-on'} />}
            pressed={muted}
            onClick={toggleMute}
          />
        }
      >
        <div className='wk-paint-gallery' data-band={band}>
          {trashed !== null && (
            <output className='wk-paint-undo-delete'>
              <span className='wk-reading-text'>{t(strings.pictureGone)}</span>
              <button type='button' className='wk-button' data-variant='primary' onClick={() => void bringBack()}>
                <InterfaceIcon name='undo' />
                <span className='wk-reading-text'>{t(strings.bringBack)}</span>
              </button>
            </output>
          )}
          {outputFailed && <output className='wk-paint-problem'>{t(strings.outputFailed)}</output>}
          {items !== null && items.length === 0 && (
            <div className='wk-paint-empty'>
              <EmojiPicture id='paint-palette' />
              <p className='wk-reading-text'>{t(strings.noPictures)}</p>
              <button
                type='button'
                className='wk-button'
                data-variant='primary'
                aria-label={t(strings.backToPainting)}
                onClick={() => void navigate({ to: PAINT_STUDIO_PATH })}
              >
                <EmojiPicture id='paintbrush' />
              </button>
            </div>
          )}
          {items !== null && items.length > 0 && (
            <ul className='wk-paint-gallery-grid' aria-label={t(strings.galleryTitle)}>
              {items.map((item) => (
                <li key={item.id} className='wk-paint-card' data-picture={item.id}>
                  <button
                    type='button'
                    className='wk-paint-card-open'
                    aria-label={t(strings.openPicture)}
                    onClick={() => open(item.id)}
                  >
                    <img src={item.url} alt='' draggable={false} />
                  </button>
                  <div className='wk-paint-card-actions'>
                    <IconButton
                      label={t(strings.copyPicture)}
                      icon={<EmojiPicture id='clipboard' />}
                      onClick={() => void copy(item.id)}
                    />
                    <IconButton
                      label={t(strings.deletePicture)}
                      icon={<EmojiPicture id='trash-can' />}
                      onClick={() => void trash(item.id)}
                    />
                    <span className='wk-paint-card-adult'>
                      <IconButton
                        label={t(strings.exportPicture)}
                        icon={<Download aria-hidden='true' className='wk-lucide' />}
                        onClick={() => void output(item.id, 'export')}
                      />
                      <IconButton
                        label={t(strings.printPicture)}
                        icon={<Printer aria-hidden='true' className='wk-lucide' />}
                        onClick={() => void output(item.id, 'print')}
                      />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Screen>
    </div>
  );
}
