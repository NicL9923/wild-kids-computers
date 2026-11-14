import { ScrollText } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '../../components/ui/Button.tsx';
import { t } from '../../core/strings/defineStrings.ts';
import { strings } from './strings.ts';

/** The file the build writes next to index.html. tools/notices.ts makes it. */
const NOTICES_URL = 'third-party-notices.txt';

type Notices = { state: 'hidden' } | { state: 'loading' } | { state: 'shown'; text: string } | { state: 'failed' };

/**
 * The licenses of the software, art, fonts, and voice the app ships, as one plain text file the
 * build writes. It loads only when the adult asks, because it is long.
 */
export function ThirdPartyNotices() {
  const [notices, setNotices] = useState<Notices>({ state: 'hidden' });
  const headingId = useId();

  const show = async () => {
    setNotices({ state: 'loading' });
    try {
      const response = await fetch(new URL(NOTICES_URL, document.baseURI));
      if (!response.ok) throw new Error(`The notices answered ${String(response.status)}.`);
      setNotices({ state: 'shown', text: await response.text() });
    } catch {
      setNotices({ state: 'failed' });
    }
  };

  return (
    <section className='wk-parent-section' aria-labelledby={headingId}>
      <h2 id={headingId}>{t(strings.notices)}</h2>
      <p className='wk-parent-about'>{t(strings.noticesAbout)}</p>
      {notices.state === 'shown' ? (
        <pre
          className='wk-parent-notices'
          // The scroll box takes focus so the arrow, page, Home, and End keys scroll the long text.
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see the comment above.
          tabIndex={0}
        >
          {notices.text}
        </pre>
      ) : (
        <div className='wk-parent-row'>
          <Button
            icon={<ScrollText className='wk-lucide' aria-hidden='true' />}
            disabled={notices.state === 'loading'}
            onClick={() => void show()}
          >
            {t(notices.state === 'loading' ? strings.noticesLoading : strings.showNotices)}
          </Button>
        </div>
      )}
      <p role='alert' className='wk-parent-problem-text'>
        {notices.state === 'failed' ? t(strings.noticesProblem) : ''}
      </p>
    </section>
  );
}
