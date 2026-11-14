import { useState, type PointerEvent } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import podArt from '../../../../../assets/art/activities/pop-the-seed-pods/pod.svg';
import poppedArt from '../../../../../assets/art/activities/pop-the-seed-pods/popped.svg';
import { BOARD, LAST_POP_PAUSE_MS, type PodsLevel } from './level.ts';
import './popTheSeedPods.css';
import { strings } from './strings.ts';

/**
 * Large pods that stay still on a calm board. A click on a pod pops it. A click on empty ground
 * shows a soft ring where the click landed, with no sound, and counts toward easing the level.
 */
export default function PopTheSeedPodsActivity({ level, kit }: ActivityProps<PodsLevel>) {
  const [popped, setPopped] = useState<ReadonlySet<string>>(new Set());

  function pop(id: string, element: HTMLElement): void {
    if (popped.has(id)) return;
    const next = new Set(popped).add(id);
    setPopped(next);
    kit.play('pop');
    kit.feedback.correct({ at: element, silent: true });
    if (next.size === level.pods.length) kit.scope.setTimeout(() => kit.roundComplete(), LAST_POP_PAUSE_MS);
  }

  function missed(event: PointerEvent<HTMLDivElement>): void {
    // Only a press on the ground itself; a press on a pod is that pod's click.
    if (event.target !== event.currentTarget) return;
    kit.feedback.wrong({ at: { x: event.clientX, y: event.clientY }, silent: true });
  }

  return (
    <div className='pods-stage'>
      <div className='pods-board' onPointerDown={missed} data-pods-left={level.pods.length - popped.size}>
        {level.pods.map((pod) => {
          const isPopped = popped.has(pod.id);
          return (
            <button
              key={pod.id}
              type='button'
              className='pods-pod'
              data-pod={pod.id}
              data-popped={isPopped}
              disabled={isPopped}
              aria-label={t(strings.pod)}
              style={{
                left: `${String((pod.x / BOARD.width) * 100)}%`,
                top: `${String((pod.y / BOARD.height) * 100)}%`,
                width: `${String((pod.size / BOARD.width) * 100)}cqw`,
              }}
              onClick={(event) => pop(pod.id, event.currentTarget)}
            >
              <img src={isPopped ? poppedArt : podArt} alt='' draggable={false} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
