import { useEffect } from 'react';
import { useAudio } from '../audio/AudioProvider.tsx';
import type { ActivityDefinition } from '../core/activityKit/defineActivity.ts';
import { t } from '../core/strings/defineStrings.ts';
import { numberHandle } from '../core/strings/shared/index.ts';
import { Screen } from '../components/ui/Screen.tsx';
import { Tile } from '../components/ui/Tile.tsx';
import { AREA_PATH } from './paths.ts';
import { ExitControl, InstructionControl, MuteControl } from './ShellControls.tsx';
import { strings } from './strings.ts';
import { useSpokenLabel } from './useSpokenLabel.ts';

/**
 * The step picker of a sequence activity. It shows every step the child has reached, numbered
 * from one, so a child can go back to any of them. Steps not reached yet are not shown at all,
 * so nothing looks locked.
 */
export function StepPicker({
  definition,
  reachable,
  onPick,
}: {
  definition: Extract<ActivityDefinition, { kind: 'sequence' }>;
  reachable: number;
  onPick: (step: number) => void;
}) {
  const audio = useAudio();
  const steps = definition.steps.slice(0, Math.max(1, reachable));
  useEffect(() => {
    void audio.speak(strings.pickAStep);
  }, [audio]);

  return (
    <div className='wk-activity-screen' data-activity={definition.id} data-screen='steps'>
      <Screen
        exit={<ExitControl to={AREA_PATH(definition.area)} label={strings.exitToArea} />}
        instruction={
          <InstructionControl instruction={[strings.pickAStep]} onReplay={() => void audio.speak(strings.pickAStep)} />
        }
        end={<MuteControl />}
      >
        <h1 className='wk-visually-hidden'>{t(definition.title)}</h1>
        <ul className='wk-choice-grid'>
          {steps.map((step, index) => (
            <li key={step.id}>
              <StepTile index={index} onPick={onPick} />
            </li>
          ))}
        </ul>
      </Screen>
    </div>
  );
}

function StepTile({ index, onPick }: { index: number; onPick: (step: number) => void }) {
  const number = numberHandle(index + 1);
  const spoken = useSpokenLabel(number);
  return (
    <Tile
      picture={
        <span className='wk-step-number' aria-hidden='true'>
          {t(number)}
        </span>
      }
      label={t(number)}
      data-step={index}
      onClick={() => onPick(index)}
      {...spoken}
    />
  );
}
