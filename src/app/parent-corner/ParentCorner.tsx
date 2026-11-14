import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, CircleAlert } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { t } from '../../core/strings/defineStrings.ts';
import { HOME_PATH } from '../paths.ts';
import { useStorageProblems } from '../session/sessionHooks.ts';
import { AppSettings } from './AppSettings.tsx';
import { ChildSettings } from './ChildSettings.tsx';
import { ProfilesSection } from './ProfilesSection.tsx';
import { SkillsPracticed } from './SkillsPracticed.tsx';
import { strings } from './strings.ts';

/** The parent corner: children, one child's settings and skills, and settings for the whole app. */
export function ParentCorner() {
  const navigate = useNavigate();
  const { saveProblem, loadProblems } = useStorageProblems();
  return (
    <div className='wk-parent'>
      <header className='wk-parent-head'>
        <Button
          icon={<ArrowLeft className='wk-lucide' aria-hidden='true' />}
          onClick={() => void navigate({ to: HOME_PATH })}
        >
          {t(strings.back)}
        </Button>
        <h1 className='wk-parent-title'>{t(strings.title)}</h1>
      </header>
      <main className='wk-parent-main'>
        <div role='alert' className='wk-parent-alerts'>
          {saveProblem !== null && <Problem text={t(strings.saveProblem)} />}
          {loadProblems.length > 0 && <Problem text={t(strings.loadProblem)} />}
        </div>
        <ProfilesSection />
        <ChildSettings />
        <SkillsPracticed />
        <AppSettings />
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
