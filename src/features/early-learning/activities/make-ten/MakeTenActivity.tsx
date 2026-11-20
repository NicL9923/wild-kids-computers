import { useEffect, useState } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { numberHandle } from '../../../../core/strings/shared/index.ts';
import '../../math/math.css';
import { Blank } from '../../math/Blank.tsx';
import { NumberChoices } from '../../math/NumberChoices.tsx';
import { strings as math } from '../../math/strings.ts';
import { useChoiceRound } from '../../math/useChoiceRound.ts';
import type { TenLevel } from './level.ts';
import './makeTen.css';
import { strings } from './strings.ts';

/**
 * A ten frame, or a five frame for the youngest, with some counters in it. The child can touch
 * an empty space to put a counter there, and hears how many they have added, which helps them
 * count on. Picking the right number fills the frame and says the whole sentence.
 */
export default function MakeTenActivity({ level, kit }: ActivityProps<TenLevel>) {
  const [added, setAdded] = useState<readonly number[]>([]);
  const round = useChoiceRound(kit, {
    answer: level.answer,
    sayCorrect: [
      numberHandle(level.filled),
      math.plus,
      numberHandle(level.answer),
      math.equals,
      numberHandle(level.whole),
    ],
  });

  // The shell asks about ten as the round starts; a five frame asks about five instead.
  useEffect(() => {
    if (level.whole === 10) return;
    kit.setInstruction(strings.five);
  }, [kit, level.whole]);

  function toggle(index: number): void {
    if (round.answered) return;
    if (added.includes(index)) {
      setAdded(added.filter((each) => each !== index));
      kit.play('tap');
      return;
    }
    const next = [...added, index];
    setAdded(next);
    kit.play('put-down');
    void kit.speak(numberHandle(next.length));
  }

  return (
    <div className='math-stage ten-stage'>
      <div className='math-board ten-board'>
        <fieldset className='ten-frame' aria-label={t(strings.frame)} data-whole={level.whole}>
          {level.spaces.map((full, index) => {
            if (full) {
              return (
                <span key={index} className='ten-space' data-space={index} data-counter='given'>
                  <span className='ten-counter' />
                  <span className='wk-visually-hidden'>{t(strings.counter)}</span>
                </span>
              );
            }
            const isAdded = round.answered || added.includes(index);
            return (
              <button
                key={index}
                type='button'
                className='ten-space'
                data-space={index}
                data-counter={isAdded ? 'added' : 'none'}
                aria-label={t(isAdded ? strings.added : strings.space)}
                disabled={round.answered}
                onClick={() => toggle(index)}
              >
                {isAdded && <span className='ten-counter' />}
              </button>
            );
          })}
        </fieldset>
        {level.sentence && (
          <p className='math-sentence ten-sentence'>
            <span>{t(numberHandle(level.filled))}</span>
            <span>{t(math.plus)}</span>
            <Blank value={level.answer} filled={round.answered} />
            <span>{t(math.equals)}</span>
            <span>{t(numberHandle(level.whole))}</span>
          </p>
        )}
      </div>
      <NumberChoices choices={level.choices} round={round} kit={kit} />
    </div>
  );
}
