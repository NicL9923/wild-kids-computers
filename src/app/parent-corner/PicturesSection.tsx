import { Download, FolderDown, Printer } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button.tsx';
import type { PictureSummary } from '../../core/platform/bridge.ts';
import type { Profile } from '../../core/storage/schemas.ts';
import { t } from '../../core/strings/defineStrings.ts';
import { useActiveProfile, usePictures } from '../session/sessionHooks.ts';
import { useShellPlatform } from '../shell/shellPlatform.tsx';
import { ProfileBadge } from './ProfilesSection.tsx';
import { strings } from './strings.ts';

interface LoadedPicture {
  readonly summary: PictureSummary;
  readonly url: string | null;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function formatSavedDate(timestamp: number): string {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? '' : dateFormatter.format(parsed);
}

/**
 * The chosen child's saved pictures, with direct save-to-computer, print, and save-all actions.
 * The parent corner is already behind the parent gate, so none of these ask the gate again.
 */
export function PicturesSection() {
  const profile = useActiveProfile();
  if (profile === null) return null;
  return <ProfilePicturesSection key={profile.id} profile={profile} />;
}

function ProfilePicturesSection({ profile }: { profile: Profile }) {
  const pictures = usePictures();
  const platform = useShellPlatform();
  const headingId = useId();
  const [items, setItems] = useState<readonly LoadedPicture[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [problemMessage, setProblemMessage] = useState<string>('');
  const busyRef = useRef(false);

  useEffect(() => {
    let live = true;
    const urls: string[] = [];

    void (async () => {
      const listed = await pictures.list('gallery');
      if (!live) return;
      if (!listed.ok) {
        setLoadFailed(true);
        setItems([]);
        return;
      }
      const loaded = await Promise.all(
        listed.value.map(async (summary): Promise<LoadedPicture> => {
          const thumb = await pictures.read(summary.id, 'thumbnail');
          if (!live || !thumb.ok) return { summary, url: null };
          const copy = new Uint8Array(thumb.value.byteLength);
          copy.set(thumb.value);
          const url = URL.createObjectURL(new Blob([copy], { type: 'image/png' }));
          urls.push(url);
          return { summary, url };
        }),
      );
      if (live) {
        setItems(loaded);
      } else {
        for (const url of urls) URL.revokeObjectURL(url);
      }
    })();

    return () => {
      live = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [pictures]);

  const exportOne = async (id: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setStatusMessage('');
    setProblemMessage('');
    try {
      const read = await pictures.read(id, 'picture');
      if (!read.ok) {
        setProblemMessage(t(strings.pictureSaveProblem));
        return;
      }
      const result = await platform.output.exportPicture(read.value, `Wild Kids picture ${id.slice(0, 8)}`);
      if (result === 'saved') setStatusMessage(t(strings.pictureSaved));
    } catch {
      setProblemMessage(t(strings.pictureSaveProblem));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const printOne = async (id: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setStatusMessage('');
    setProblemMessage('');
    try {
      const read = await pictures.read(id, 'picture');
      if (!read.ok) {
        setProblemMessage(t(strings.picturePrintProblem));
        return;
      }
      const result = await platform.output.printPicture(read.value);
      if (result === 'printed') setStatusMessage(t(strings.picturePrinted));
    } catch {
      setProblemMessage(t(strings.picturePrintProblem));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const exportAll = async () => {
    if (busyRef.current || items === null || items.length === 0) return;
    busyRef.current = true;
    setBusy(true);
    setStatusMessage('');
    setProblemMessage('');
    let saved = 0;
    try {
      for (const item of items) {
        const read = await pictures.read(item.summary.id, 'picture');
        if (!read.ok) {
          setProblemMessage(t(strings.pictureSaveProblem));
          break;
        }
        const result = await platform.output.exportPicture(
          read.value,
          `Wild Kids picture ${item.summary.id.slice(0, 8)}`,
        );
        if (result === 'cancelled') break;
        saved += 1;
      }
      if (saved > 0) setStatusMessage(t(strings.picturesAllSaved));
    } catch {
      setProblemMessage(t(strings.pictureSaveProblem));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <section className='wk-parent-section' aria-labelledby={headingId}>
      <h2 id={headingId}>{t(strings.childPictures)}</h2>
      <p className='wk-parent-about'>{t(strings.childPicturesAbout)}</p>
      <ProfileBadge profile={profile} />
      {loadFailed ? (
        <p role='alert' className='wk-parent-problem-text'>
          {t(strings.picturesLoadProblem)}
        </p>
      ) : items === null ? (
        <p className='wk-parent-empty'>{t(strings.picturesLoading)}</p>
      ) : items.length === 0 ? (
        <p className='wk-parent-empty'>{t(strings.picturesEmpty)}</p>
      ) : (
        <>
          <div className='wk-parent-row'>
            <Button
              icon={<FolderDown className='wk-lucide' aria-hidden='true' />}
              disabled={busy}
              onClick={() => void exportAll()}
            >
              {t(strings.saveAllPictures)}
            </Button>
          </div>
          <output className='wk-parent-about'>{statusMessage}</output>
          <p role='alert' className='wk-parent-problem-text'>
            {problemMessage}
          </p>
          <ul className='wk-parent-pictures'>
            {items.map((item, index) => {
              const savedDate = formatSavedDate(item.summary.updatedAt);
              const label =
                savedDate === ''
                  ? `${t(strings.pictureItem)} ${String(index + 1)}`
                  : `${t(strings.pictureItem)} ${String(index + 1)}, ${savedDate}`;
              const saveLabel = `${t(strings.savePicture)}: ${label}`;
              const printLabel = `${t(strings.printPicture)}: ${label}`;
              return (
                <li key={item.summary.id} className='wk-parent-picture'>
                  <div className='wk-parent-picture-frame'>
                    {item.url !== null && <img src={item.url} alt={label} className='wk-parent-picture-img' />}
                  </div>
                  <p className='wk-parent-picture-date'>{savedDate}</p>
                  <div className='wk-parent-row'>
                    <Button
                      icon={<Download className='wk-lucide' aria-hidden='true' />}
                      disabled={busy}
                      aria-label={saveLabel}
                      onClick={() => void exportOne(item.summary.id)}
                    >
                      {t(strings.savePicture)}
                    </Button>
                    <Button
                      icon={<Printer className='wk-lucide' aria-hidden='true' />}
                      disabled={busy}
                      aria-label={printLabel}
                      onClick={() => void printOne(item.summary.id)}
                    >
                      {t(strings.printPicture)}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
