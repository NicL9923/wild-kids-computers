import { useEffect, type CSSProperties } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { numberHandle } from '../../../../core/strings/shared/index.ts';
import '../../math/math.css';
import { Blank } from '../../math/Blank.tsx';
import { NumberChoices } from '../../math/NumberChoices.tsx';
import { strings as math } from '../../math/strings.ts';
import { useChoiceRound } from '../../math/useChoiceRound.ts';
import type { TimesLevel } from './level.ts';
import './timesTables.css';
import { strings } from './strings.ts';

/**
 * Rows of things, the fact as numbers, or both, and numbers to choose from. When only the fact
 * shows, two wrong tries bring the rows of things back, so the child can count them. Nothing is
 * timed.
 */
export default function TimesTablesActivity({ level, kit }: ActivityProps<TimesLevel>) {
  const rows = numberHandle(level.rows);
  const columns = numberHandle(level.columns);
  const round = useChoiceRound(kit, {
    answer: level.answer,
    sayCorrect: [rows, math.times, columns, math.equals, numberHandle(level.answer)],
  });

  useEffect(() => {
    const instruction =
      level.show === 'array'
        ? [rows, strings.rowsOf, columns, strings.howMany]
        : [strings.whatIs, rows, math.times, columns];
    kit.setInstruction(instruction);
  }, [kit, level.show, rows, columns]);

  const showArray = level.show !== 'fact' || round.hinted || round.answered;
  const showFact = level.show !== 'array';
  const shape = { '--cols': level.columns, '--rows': level.rows } as CSSProperties;

  return (
    <div className='math-stage'>
      <div className='math-board times-board' data-show={level.show}>
        {showFact && (
          <p className='math-sentence times-fact'>
            <span>{t(rows)}</span>
            <span>{t(math.times)}</span>
            <span>{t(columns)}</span>
            <span>{t(math.equals)}</span>
            <Blank value={level.answer} filled={round.answered} />
          </p>
        )}
        {showArray && (
          <div className='times-array-area'>
            <div className='math-objects times-array' style={shape}>
              {Array.from({ length: level.answer }, (_, index) => (
                <Emoji key={index} id={level.kind} decorative className='math-object' />
              ))}
            </div>
            <span className='wk-visually-hidden'>
              {t(rows)} {t(strings.rowsOf)} {t(columns)}
            </span>
          </div>
        )}
      </div>
      <NumberChoices choices={level.choices} round={round} kit={kit} />
    </div>
  );
}
