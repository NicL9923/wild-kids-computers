import { useNavigate } from '@tanstack/react-router';
import { Button } from '../../components/ui/Button.tsx';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon.tsx';
import { t } from '../../core/strings/defineStrings.ts';
import { HOME_PATH } from '../paths.ts';
import { ReplayButton, useSpeakOnShow } from './Instruction.tsx';
import { strings } from './strings.ts';
import './shell.css';

const SPOKEN = [strings.notFound, strings.backToMeadow];

/** A place that does not exist, or is not built yet. One calm sentence and one way back. */
export function NotFound() {
  const navigate = useNavigate();
  useSpeakOnShow(SPOKEN);
  return (
    <main className='wk-not-found'>
      <div className='wk-not-found-body'>
        <ReplayButton handles={SPOKEN} />
        <h1 className='wk-not-found-heading'>{t(strings.notFound)}</h1>
        <Button
          variant='primary'
          icon={<InterfaceIcon name='meadow' />}
          onClick={() => void navigate({ to: HOME_PATH, replace: true })}
        >
          {t(strings.backToMeadow)}
        </Button>
      </div>
    </main>
  );
}
