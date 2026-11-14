import { Clock, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '../../components/ui/Button.tsx';
import { CalmPanel } from '../../components/ui/CalmPanel.tsx';
import { Dialog } from '../../components/ui/Dialog.tsx';
import { IconButton } from '../../components/ui/IconButton.tsx';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon.tsx';
import { t } from '../../core/strings/defineStrings.ts';
import { useQuitApp } from '../kiosk/QuitGuard.tsx';
import { useParentGate } from '../parent-gate/ParentGate.tsx';
import { HOME_PATH } from '../paths.ts';
import { useSessionLength, useSessionStatus } from '../session/sessionHooks.ts';
import { useSpeakOnShow } from '../shell/Instruction.tsx';
import { strings as shellStrings } from '../shell/strings.ts';
import { strings } from './strings.ts';
import { MORE_TIME_MS } from './useSessionLimit.ts';
import '../shell/shell.css';

const SPOKEN = [strings.heading];

/**
 * The calm screen after the session length is used up: the closing picture and one spoken
 * sentence. It has no clock, no count, and no way for the child to leave. A grown-up control in
 * the corner, behind the parent gate, gives a little more time or closes the app.
 */
export default function ClosingScreen() {
  const status = useSessionStatus();
  const askParent = useParentGate();
  const navigate = useNavigate();
  const quitApp = useQuitApp();
  const { grantPlayTime } = useSessionLength();
  const [choosing, setChoosing] = useState(false);
  useSpeakOnShow(SPOKEN);

  const openChoices = async () => {
    if (await askParent('closing')) setChoosing(true);
  };

  const moreTime = () => {
    // With no child chosen there is no limit to move; the home screen sends them to the start.
    if (status === 'ready') grantPlayTime(MORE_TIME_MS);
    setChoosing(false);
    void navigate({ to: HOME_PATH, replace: true });
  };

  return (
    <div className='wk-closing'>
      <CalmPanel picture='closing' heading={t(strings.heading)} />
      <div className='wk-corner-control'>
        <IconButton
          label={t(shellStrings.grownUps)}
          icon={<InterfaceIcon name='parent-corner' />}
          onClick={() => void openChoices()}
        />
      </div>
      <Dialog
        open={choosing}
        onOpenChange={setChoosing}
        title={t(strings.choicesTitle)}
        description={t(strings.choicesAbout)}
        closeLabel={t(strings.close)}
        actions={
          <>
            <Button icon={<Clock className='wk-lucide' aria-hidden='true' />} onClick={moreTime}>
              {t(strings.moreTime)}
            </Button>
            <Button icon={<LogOut className='wk-lucide' aria-hidden='true' />} onClick={() => void quitApp()}>
              {t(strings.closeApp)}
            </Button>
          </>
        }
      />
    </div>
  );
}
