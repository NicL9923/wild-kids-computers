import { useEffect, type CSSProperties } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { feedback, numberHandle } from '../../../../core/strings/shared/index.ts';
import '../../math/math.css';
import { useChoiceRound } from '../../math/useChoiceRound.ts';
import { FractionPicture } from './FractionPicture.tsx';
import './fractions.css';
import { fractionKey, type Fraction, type FractionLevel, type Picture } from './level.ts';
import { fractionName } from './names.ts';
import { strings } from './strings.ts';

/**
 * A fraction written with the numerator over the denominator. Assistive technology reads its
 * name, "two thirds", instead of two separate numbers.
 */
function Written({ fraction }: { fraction: Fraction }) {
  return (
    <>
      <span className='fraction-written' aria-hidden='true'>
        <span>{t(numberHandle(fraction.numerator))}</span>
        <span className='fraction-line' />
        <span>{t(numberHandle(fraction.denominator))}</span>
      </span>
      <span className='wk-visually-hidden'>{t(fractionName(fraction))}</span>
    </>
  );
}

const pictureName = (picture: Picture) =>
  t(picture.fraction === null ? strings.notEqual : fractionName(picture.fraction));

/**
 * Either a fraction and pictures to choose from, or a picture and fractions to choose from. Each
 * written fraction says its name when the pointer rests on it or it gets focus. A wrong choice is
 * set aside, and after two the right one is shown more plainly.
 */
export default function FractionsActivity({ level, kit }: ActivityProps<FractionLevel>) {
  const name = fractionName(level.target);
  const round = useChoiceRound(kit, { answer: level.answer, sayCorrect: [name, feedback.thatsIt] });
  const pickPicture = level.mode === 'pick-picture';

  // The shell asks to find a picture as the round starts; this adds the fraction, or asks the other way.
  useEffect(() => {
    const instruction = pickPicture ? [strings.findPicture, name] : [strings.whichFraction];
    return kit.scope.setTimeout(() => kit.setInstruction(instruction), 0);
  }, [kit, pickPicture, name]);

  if (pickPicture) {
    return (
      <div className='math-stage fraction-stage'>
        <button type='button' className='fraction-card' onClick={() => void kit.speak(name)}>
          <Written fraction={level.target} />
        </button>
        <fieldset
          className='math-groups'
          aria-label={t(strings.pictures)}
          style={{ '--cols': 1, '--rows': 1 } as CSSProperties}
        >
          {level.pictures.map((picture) => {
            const look = round.lookOf(picture.id);
            return (
              <button
                key={picture.id}
                type='button'
                className='math-group fraction-choice-picture'
                data-picture={picture.id}
                data-look={look}
                aria-label={pictureName(picture)}
                disabled={look === 'tried' || look === 'done'}
                onClick={(event) => round.choose(picture.id, event.currentTarget)}
              >
                <FractionPicture picture={picture} />
              </button>
            );
          })}
        </fieldset>
      </div>
    );
  }

  const [picture] = level.pictures;
  return (
    <div className='math-stage'>
      <div className='math-board'>
        {picture !== undefined && (
          <div className='fraction-shown'>
            <FractionPicture picture={picture} />
            <span className='wk-visually-hidden'>{pictureName(picture)}</span>
          </div>
        )}
      </div>
      <fieldset className='math-choices' aria-label={t(strings.fractions)}>
        {level.fractions.map((fraction) => {
          const key = fractionKey(fraction);
          const handle = fractionName(fraction);
          const look = round.lookOf(key);
          return (
            <button
              key={key}
              type='button'
              className='math-choice fraction-choice'
              data-fraction={key}
              data-look={look}
              disabled={look === 'tried' || look === 'done'}
              onPointerEnter={() => void kit.speak(handle)}
              onFocus={() => void kit.speak(handle)}
              onClick={(event) => round.choose(key, event.currentTarget)}
            >
              <Written fraction={fraction} />
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
