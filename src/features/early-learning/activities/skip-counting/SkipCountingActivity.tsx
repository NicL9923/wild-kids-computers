import { useEffect, type CSSProperties } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { numberHandle } from '../../../../core/strings/shared/index.ts';
import '../../math/math.css';
import { Blank } from '../../math/Blank.tsx';
import { NumberChoices } from '../../math/NumberChoices.tsx';
import { strings as math } from '../../math/strings.ts';
import { useChoiceRound } from '../../math/useChoiceRound.ts';
import type { SkipLevel, Step } from './level.ts';
import './skipCounting.css';
import { strings } from './strings.ts';

const COUNT_BY: Readonly<Record<Step, SpokenHandle>> = {
  2: strings.byTwos,
  5: strings.byFives,
  10: strings.byTens,
};

/**
 * A row of stepping stones counting by twos, fives, or tens, with one stone blank. The instruction
 * says the count up to the blank, so the child hears the rhythm. Picking the right number fills
 * the stone and the whole count is said aloud.
 */
export default function SkipCountingActivity({ level, kit }: ActivityProps<SkipLevel>) {
  const handles = level.numbers.map(numberHandle);
  const round = useChoiceRound(kit, { answer: level.answer, sayCorrect: handles });

  useEffect(() => {
    const atEnd = level.blank === level.numbers.length - 1;
    const instruction = atEnd
      ? [COUNT_BY[level.step], ...level.numbers.slice(0, level.blank).map(numberHandle), strings.whatNext]
      : [COUNT_BY[level.step], strings.whichMissing];
    return kit.scope.setTimeout(() => kit.setInstruction(instruction), 0);
  }, [kit, level.step, level.numbers, level.blank]);

  const hop = (
    <span className='skip-hop' aria-hidden='true'>
      {t(math.plus)}
      {t(numberHandle(level.step))}
    </span>
  );

  return (
    <div className='math-stage'>
      <div className='math-board'>
        <ol
          className='skip-row'
          aria-label={t(strings.count)}
          style={{ '--stones': level.numbers.length } as CSSProperties}
        >
          {level.numbers.map((value, index) => {
            const isBlank = index === level.blank;
            return (
              <li key={index} className='skip-slot' data-stone={index}>
                {level.hops && index > 0 && hop}
                {isBlank ? (
                  <Blank className='skip-stone' value={value} filled={round.answered} />
                ) : (
                  <span className='skip-stone'>{t(numberHandle(value))}</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <NumberChoices choices={level.choices} round={round} kit={kit} />
    </div>
  );
}
