import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, CircleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button.tsx';
import type { OsFamily } from '../../core/platform/bridge.ts';
import { t } from '../../core/strings/defineStrings.ts';
import { strings as gateStrings } from '../parent-gate/strings.ts';
import { HOME_PATH } from '../paths.ts';
import { useStorageProblems } from '../session/sessionHooks.ts';
import { useShellPlatform } from '../shell/shellPlatform.tsx';
import { AppSettings } from './AppSettings.tsx';
import { ChildSettings } from './ChildSettings.tsx';
import { PicturesSection } from './PicturesSection.tsx';
import { ProfilesSection } from './ProfilesSection.tsx';
import { SkillsPracticed } from './SkillsPracticed.tsx';
import { ThirdPartyNotices } from './ThirdPartyNotices.tsx';
import { strings } from './strings.ts';

/** The parent corner: children, one child's settings, skills, pictures, whole-app settings, and licenses. */
export function ParentCorner() {
  const navigate = useNavigate();
  const platform = useShellPlatform();
  const { saveProblem, loadProblems } = useStorageProblems();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [place, setPlace] = useState<{ os: OsFamily; isElectron: boolean } | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (loadProblems.length === 0) return undefined;
    let live = true;
    void (async () => {
      try {
        const info = await platform.info();
        if (live) setPlace({ os: info.os, isElectron: info.isElectron });
      } catch {
        // Leave the OS hint blank when platform info cannot be read.
      }
    })();
    return () => {
      live = false;
    };
  }, [loadProblems.length, platform]);

  const affectedDocuments = loadProblems.map((problem) => problem.document).join(', ');

  return (
    <div className='wk-parent'>
      <header className='wk-parent-head'>
        <Button
          icon={<ArrowLeft className='wk-lucide' aria-hidden='true' />}
          onClick={() => void navigate({ to: HOME_PATH })}
        >
          {t(strings.back)}
        </Button>
        <h1 ref={headingRef} tabIndex={-1} className='wk-parent-title'>
          {t(strings.title)}
        </h1>
      </header>
      <main className='wk-parent-main'>
        <div role='alert' className='wk-parent-alerts'>
          {saveProblem !== null && (
            <Problem text={t(saveProblem.code === 'storage-full' ? strings.saveProblemFull : strings.saveProblem)} />
          )}
          {loadProblems.length > 0 && (
            <div className='wk-parent-problem-detail'>
              <Problem text={t(strings.loadProblem)} />
              <p className='wk-parent-about'>
                {t(strings.loadProblemFiles)} {affectedDocuments}
              </p>
              {place?.isElectron && <code className='wk-parent-folder'>{t(gateStrings[`folder-${place.os}`])}</code>}
            </div>
          )}
        </div>
        <ProfilesSection />
        <ChildSettings />
        <SkillsPracticed />
        <PicturesSection />
        <AppSettings />
        <ThirdPartyNotices />
      </main>
    </div>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <p className='wk-parent-problem'>
      <CircleAlert className='wk-lucide' aria-hidden='true' />
      {text}
    </p>
  );
}
