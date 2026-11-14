import { useState } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { feedback, numberHandle } from '../../../../core/strings/shared/index.ts';
import './countTheFlowers.css';
import { BED, type FlowersLevel } from './level.ts';
import { strings } from './strings.ts';

/** The wait after the right number, so the child hears it before the next round. */
const ANSWER_PAUSE_MS = 1400;

/**
 * Flowers in a bed and a row of numbers. Touching a flower counts it out loud and puts its number
 * on it, which helps a child keep track. Picking the matching number ends the round. A wrong
 * number is set aside with a neutral "Try another one" and the round goes on.
 */
export default function CountTheFlowersActivity({ level, kit }: ActivityProps<FlowersLevel>) {
  const [counted, setCounted] = useState<readonly string[]>([]);
  const [tried, setTried] = useState<ReadonlySet<number>>(new Set());
  const [answered, setAnswered] = useState(false);

  function count(id: string): void {
    if (counted.includes(id) || answered) return;
    const next = [...counted, id];
    setCounted(next);
    kit.play('tap');
    void kit.speak(numberHandle(next.length));
  }

  function choose(choice: number, element: HTMLElement): void {
    if (answered || tried.has(choice)) return;
    if (choice === level.count) {
      setAnswered(true);
      kit.feedback.correct({ at: element });
      void kit.speakSequence([numberHandle(choice), feedback.thatsIt]);
      kit.scope.setTimeout(() => kit.roundComplete(), ANSWER_PAUSE_MS);
      return;
    }
    setTried(new Set(tried).add(choice));
    kit.feedback.wrong({ at: element, say: feedback.tryAnother });
  }

  return (
    <div className='flowers-stage' data-count={level.count}>
      <div className='flowers-bed-area'>
        <div className='flowers-bed' data-arrangement={level.arrangement}>
          {level.flowers.map((flower) => {
            const order = counted.indexOf(flower.id);
            return (
              <button
                key={flower.id}
                type='button'
                className='flowers-flower'
                data-flower={flower.id}
                aria-pressed={order !== -1}
                style={{
                  left: `${String((flower.x / BED.width) * 100)}%`,
                  top: `${String((flower.y / BED.height) * 100)}%`,
                  width: `${String((level.size / BED.width) * 100)}cqw`,
                }}
                onClick={() => count(flower.id)}
              >
                <Emoji id={level.kind} className='flowers-picture' />
                {order !== -1 && (
                  <span className='flowers-badge' data-counted={order + 1}>
                    {t(numberHandle(order + 1))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <fieldset className='flowers-choices' aria-label={t(strings.numbers)}>
        {level.choices.map((choice) => {
          const handle = numberHandle(choice);
          const isTried = tried.has(choice);
          const isAnswer = answered && choice === level.count;
          return (
            <button
              key={choice}
              type='button'
              className='flowers-choice'
              data-choice={choice}
              data-tried={isTried}
              data-answer={isAnswer}
              disabled={isTried || (answered && !isAnswer)}
              onPointerEnter={() => void kit.speak(handle)}
              onFocus={() => void kit.speak(handle)}
              onClick={(event) => choose(choice, event.currentTarget)}
            >
              {t(handle)}
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
