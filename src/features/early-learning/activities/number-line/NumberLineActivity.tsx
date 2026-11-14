import { useEffect } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { feedback, numberHandle } from '../../../../core/strings/shared/index.ts';
import '../../math/math.css';
import { Blank } from '../../math/Blank.tsx';
import { NumberChoices } from '../../math/NumberChoices.tsx';
import { useChoiceRound } from '../../math/useChoiceRound.ts';
import type { LineLevel, Mark } from './level.ts';
import './numberLine.css';
import { strings } from './strings.ts';

/** The line runs across a board 1000 units wide, with a margin at each end. */
const LINE_START = 60;
const LINE_LENGTH = 880;

const percentAlong = (mark: Mark, count: number) =>
  `${String(((LINE_START + (mark.index * LINE_LENGTH) / (count - 1)) / 1000) * 100)}%`;

/**
 * A number line. In a "missing" round one label is blank and the child picks its number from a
 * row of choices. In a "place" round a number sits above the line and the child clicks its mark.
 * A wrong try is set aside, and after two the right one is shown more plainly.
 */
export default function NumberLineActivity({ level, kit }: ActivityProps<LineLevel>) {
  const placing = level.mode === 'place';
  const number = numberHandle(level.answer);
  const round = useChoiceRound(kit, {
    answer: placing ? level.target : level.answer,
    sayCorrect: [number, feedback.thatsIt],
  });

  // The shell asks for the missing number as the round starts; a place round asks for its number.
  useEffect(() => {
    if (!placing) return undefined;
    return kit.scope.setTimeout(() => kit.setInstruction([strings.placeFor, number]), 0);
  }, [kit, placing, number]);

  const count = level.marks.length;
  // A mark's spacing, as a share of the board, sizes the buttons on it.
  const spacing = `${String((LINE_LENGTH / (count - 1) / 1000) * 100)}%`;

  return (
    <div className='math-stage line-stage' data-mode={level.mode}>
      <div className='math-board'>
        <div className='line-area'>
          {placing && (
            <button type='button' className='line-number' onClick={() => void kit.speak(number)}>
              {t(number)}
            </button>
          )}
          <div className='line-board'>
            <svg className='line-art' viewBox='0 0 1000 200' aria-hidden='true' focusable='false'>
              <line x1={LINE_START - 30} y1={70} x2={LINE_START + LINE_LENGTH + 30} y2={70} />
              <polyline points='1000,70 975,55 975,85' className='line-arrow' />
              <polyline points='0,70 25,55 25,85' className='line-arrow' />
              {level.marks.map((mark) => {
                const x = LINE_START + (mark.index * LINE_LENGTH) / (count - 1);
                return <line key={mark.index} x1={x} y1={40} x2={x} y2={100} className='line-tick' />;
              })}
            </svg>
            {level.marks.map((mark) => {
              const left = percentAlong(mark, count);
              const isTarget = mark.index === level.target;
              if (mark.labeled) {
                return (
                  <span key={mark.index} className='line-label' style={{ left }} data-mark={mark.index}>
                    {t(numberHandle(mark.value))}
                  </span>
                );
              }
              if (!placing) {
                return (
                  <Blank
                    key={mark.index}
                    className='line-label'
                    style={{ left }}
                    data-mark={mark.index}
                    value={level.answer}
                    filled={round.answered}
                  />
                );
              }
              const look = round.lookOf(mark.index);
              return (
                <button
                  key={mark.index}
                  type='button'
                  className='line-spot'
                  style={{ left, width: spacing }}
                  data-mark={mark.index}
                  data-look={look}
                  aria-label={t(numberHandle(mark.value))}
                  disabled={look === 'tried' || look === 'done'}
                  onClick={(event) => round.choose(mark.index, event.currentTarget)}
                >
                  {isTarget && round.answered && <span className='line-placed'>{t(number)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {!placing && <NumberChoices choices={level.choices} round={round} kit={kit} />}
    </div>
  );
}
