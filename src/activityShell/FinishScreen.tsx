import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useAudio } from '../audio/AudioProvider.tsx';
import type { AreaId } from '../core/activityKit/defineActivity.ts';
import { t } from '../core/strings/defineStrings.ts';
import { strings as feedback } from '../core/strings/shared/feedback.ts';
import { Button } from '../components/ui/Button.tsx';
import { CalmPanel } from '../components/ui/CalmPanel.tsx';
import { InterfaceIcon } from '../components/ui/InterfaceIcon.tsx';
import { AREA_PATH } from './paths.ts';
import { MuteControl } from './ShellControls.tsx';
import { strings } from './strings.ts';
import { useSpokenLabel } from './useSpokenLabel.ts';

/**
 * The calm screen after a set of rounds: two equal choices, play again or go back. No score,
 * count, or star. Both buttons look the same, so neither is the one to pick.
 */
export function FinishScreen({ area, onPlayAgain }: { area: AreaId; onPlayAgain: () => void }) {
  const audio = useAudio();
  const navigate = useNavigate();
  const playAgainLabel = useSpokenLabel(strings.playAgain);
  const goBackLabel = useSpokenLabel(strings.goBack);

  useEffect(() => {
    void audio.speak(feedback.allDone);
  }, [audio]);

  return (
    <div className='wk-finish' data-screen='finish'>
      <CalmPanel
        picture='finish'
        heading={t(feedback.allDone)}
        actions={
          <>
            <Button
              variant='primary'
              icon={<InterfaceIcon name='play-again' />}
              onClick={onPlayAgain}
              {...playAgainLabel}
            >
              {t(strings.playAgain)}
            </Button>
            <Button
              variant='primary'
              icon={<InterfaceIcon name='exit' />}
              onClick={() => void navigate({ to: AREA_PATH(area) })}
              {...goBackLabel}
            >
              {t(strings.goBack)}
            </Button>
          </>
        }
      />
      <div className='wk-finish-end'>
        <MuteControl />
      </div>
    </div>
  );
}
