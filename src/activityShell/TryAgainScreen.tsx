import type { ReactNode } from 'react';
import { Button } from '../components/ui/Button.tsx';
import { InterfaceIcon } from '../components/ui/InterfaceIcon.tsx';
import { Screen } from '../components/ui/Screen.tsx';
import { t, type SpokenHandle } from '../core/strings/defineStrings.ts';
import { ReplayButton, useSpeakOnShow } from '../app/shell/Instruction.tsx';
import { strings as appShellStrings } from '../app/shell/strings.ts';
import { MuteControl } from './ShellControls.tsx';
import { useSpokenLabel } from './useSpokenLabel.ts';
import './activityShell.css';

/**
 * The calm screen for something that did not open: one spoken sentence, its replay control, the
 * mute control, and one big control to try again. The way out, when the screen has one, sits in
 * its usual top left place. Nothing blames the child, and nothing counts the tries.
 */
export function TryAgainScreen({
  message,
  onTryAgain,
  busy = false,
  exit,
}: {
  /** A list defined once at module level, so a re-render does not speak it again. */
  message: readonly [SpokenHandle];
  onTryAgain: () => void;
  /** While a try is still running, the control waits instead of starting another. */
  busy?: boolean;
  exit?: ReactNode;
}) {
  const tryAgainLabel = useSpokenLabel(appShellStrings.tryAgain);
  useSpeakOnShow(message);
  return (
    <div className='wk-try-again' data-screen='try-again'>
      <Screen exit={exit} instruction={<ReplayButton handles={message} />} end={<MuteControl />}>
        <div className='wk-try-again-body'>
          <h1 className='wk-try-again-heading'>{t(message[0])}</h1>
          <Button
            variant='primary'
            icon={<InterfaceIcon name='play-again' />}
            onClick={onTryAgain}
            disabled={busy}
            aria-busy={busy}
            {...tryAgainLabel}
          >
            {t(appShellStrings.tryAgain)}
          </Button>
        </div>
      </Screen>
    </div>
  );
}
