import { Navigate, useNavigate } from '@tanstack/react-router';
import { Download, Printer } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBand, useSessionStatus } from '../../../app/session/sessionHooks.ts';
import { useBoundedPictures } from '../boundedPictures.ts';
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
import { createScope } from '../../../core/activityKit/scope.ts';
import { kitScheduler } from '../../../activityShell/kitTime.ts';
import { EmojiPicture } from '../studio/controls.tsx';
import { TrashUndo } from './trashUndo.ts';
import '../paintStudio.css';

interface GalleryItem {
  readonly id: string;
  readonly updatedAt: number;
  /** An object URL of the thumbnail, revoked when the list changes or the screen closes. */
  readonly url: string;
}

/** How long the "bring it back" control stays after a picture goes in the trash. */
const UNDO_DELETE_MS = 12_000;

interface GalleryLoadResult {
  readonly ok: boolean;
  readonly items: GalleryItem[];
}

/** Reads one picture's thumbnail into an object URL, or null when unreadable. */
async function readGalleryItem(pictures: ProfilePictures, id: string, updatedAt: number): Promise<GalleryItem | null> {
  const thumbnail = await pictures.read(id, 'thumbnail');
  if (!thumbnail.ok) return null;
  const url = URL.createObjectURL(new Blob([new Uint8Array(thumbnail.value)], { type: 'image/png' }));
  return { id, updatedAt, url };
}

/** The gallery's pictures, newest first, each with its thumbnail ready to show. */
async function loadGallery(pictures: ProfilePictures): Promise<GalleryLoadResult> {
  const listed = await pictures.list('gallery');
  if (!listed.ok) return { ok: false, items: [] };
  const results = await Promise.all(
    listed.value.map((summary) => readGalleryItem(pictures, summary.id, summary.updatedAt)),
  );
  return { ok: true, items: results.filter((item): item is GalleryItem => item !== null) };
}

/** The active profile's pictures. Pictures belong to a profile, so without one it goes to the start. */
export default function PaintGallery() {
  const status = useSessionStatus();
  if (status === 'loading') return null;
  if (status !== 'ready') return <Navigate to='/' replace />;
  return <GalleryScreen />;
}

function GalleryScreen() {
  const pictures = useBoundedPictures();
  const band = useBand();
  const audio = useAudio();
  const [muted, toggleMute] = useMute();
  const navigate = useNavigate();
  const requestParentGate = useRequestParentGate();
  const [items, setItems] = useState<readonly GalleryItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [trashed, setTrashed] = useState<string | null>(null);
  const [outputFailed, setOutputFailed] = useState(false);
  const undo = useRef<TrashUndo | null>(null);
  const urls = useRef<Set<string>>(new Set());
  const mounted = useRef(true);
  const loadGen = useRef(0);
  const outputBusy = useRef(false);

  const revokeAll = useCallback(() => {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
  }, []);

  const show = useCallback(
    (loaded: readonly GalleryItem[]) => {
      revokeAll();
      for (const item of loaded) urls.current.add(item.url);
      setItems(loaded);
    },
    [revokeAll],
  );

  const refresh = useCallback(async () => {
    const gen = ++loadGen.current;
    const result = await loadGallery(pictures);
    if (!mounted.current || gen !== loadGen.current) {
      for (const item of result.items) URL.revokeObjectURL(item.url);
      return;
    }
    setLoadFailed(!result.ok);
    show(result.items);
  }, [pictures, show]);

  useEffect(() => {
    mounted.current = true;
    const created = createScope(kitScheduler);
    const trashUndo = new TrashUndo({
      scope: created,
      undoMs: UNDO_DELETE_MS,
      purge: (id) => void pictures.purge(id),
      onChange: setTrashed,
    });
    undo.current = trashUndo;
    const gen = ++loadGen.current;
    void (async () => {
      // A picture left in the trash by an earlier visit that never closed, such as a crash, has
      // no way back on screen, so it goes now.
      const leftOver = await pictures.list('trash');
      if (leftOver.ok) for (const picture of leftOver.value) void pictures.purge(picture.id);
      const result = await loadGallery(pictures);
      if (mounted.current && gen === loadGen.current) {
        setLoadFailed(!result.ok);
        show(result.items);
      } else {
        for (const item of result.items) URL.revokeObjectURL(item.url);
      }
    })();
    return () => {
      mounted.current = false;
      trashUndo.close();
      created.dispose();
      revokeAll();
    };
  }, [pictures, show, revokeAll]);

  const open = (id: string): void => {
    audio.play('open');
    void navigate({ to: PAINT_STUDIO_PATH, search: { picture: id } });
  };

  const copy = async (id: string): Promise<void> => {
    const result = await pictures.copy(id);
    if (!result.ok || !mounted.current) return;
    audio.play('snap');
    void audio.speak(strings.copyPicture);
    const added = await readGalleryItem(pictures, result.value.id, result.value.updatedAt);
    if (!mounted.current) {
      if (added !== null) URL.revokeObjectURL(added.url);
      return;
    }
    if (added === null) {
      await refresh();
      return;
    }
    urls.current.add(added.url);
    setItems((current) => (current === null ? [added] : [added, ...current]));
  };

  const trash = async (id: string): Promise<void> => {
    const result = await pictures.trash(id);
    if (!result.ok || !mounted.current) return;
    audio.play('whoosh');
    void audio.speak(strings.pictureGone);
    undo.current?.trashed(id);
    setItems((current) => {
      if (current === null) return current;
      const removed = current.find((item) => item.id === id);
      if (removed !== undefined) {
        URL.revokeObjectURL(removed.url);
        urls.current.delete(removed.url);
      }
      return current.filter((item) => item.id !== id);
    });
  };

  const bringBack = async (): Promise<void> => {
    const id = undo.current?.beginBringBack() ?? null;
    if (id === null) return;
    const result = await pictures.restore(id);
    if (!result.ok) {
      undo.current?.cancelBringBack(id);
      return;
    }
    undo.current?.finishBringBack(id);
    if (!mounted.current) return;
    audio.play('pop');
    void audio.speak(strings.bringBack);
    const restored = await readGalleryItem(pictures, result.value.id, result.value.updatedAt);
    if (!mounted.current) {
      if (restored !== null) URL.revokeObjectURL(restored.url);
      return;
    }
    if (restored === null) {
      await refresh();
      return;
    }
    urls.current.add(restored.url);
    setItems((current) =>
      current === null
        ? [restored]
        : [restored, ...current.filter((item) => item.id !== restored.id)].toSorted(
            (a, b) => b.updatedAt - a.updatedAt,
          ),
    );
  };

  const output = async (id: string, reason: ParentGateReason): Promise<void> => {
    if (outputBusy.current) return;
    outputBusy.current = true;
    setOutputFailed(false);
    try {
      if (!(await requestParentGate(reason))) return;
      const read = await pictures.read(id, 'picture');
      if (!read.ok) {
        if (mounted.current) setOutputFailed(true);
        return;
      }
      const bridge = getBridge();
      if (reason === 'export') await bridge.output.exportPicture(read.value, `Wild Kids picture ${id.slice(0, 8)}`);
      else await bridge.output.printPicture(read.value);
    } catch {
      if (mounted.current) setOutputFailed(true);
    } finally {
      outputBusy.current = false;
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
          {loadFailed && <output className='wk-paint-problem'>{t(strings.galleryLoadFailed)}</output>}
          {!loadFailed && items !== null && items.length === 0 && (
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
              {items.map((item, index) => {
                const openLabel = `${t(strings.openPicture)} ${String(index + 1)}`;
                return (
                  <li key={item.id} className='wk-paint-card' data-picture={item.id}>
                    <button
                      type='button'
                      className='wk-paint-card-open'
                      aria-label={openLabel}
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
                );
              })}
            </ul>
          )}
        </div>
      </Screen>
    </div>
  );
}
