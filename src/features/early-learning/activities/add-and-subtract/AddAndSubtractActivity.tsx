import { useEffect, useState, type CSSProperties } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { numberHandle } from '../../../../core/strings/shared/index.ts';
import '../../math/math.css';
import { Blank } from '../../math/Blank.tsx';
import { NumberChoices } from '../../math/NumberChoices.tsx';
import { PER_ROW } from '../../math/ObjectGroup.tsx';
import { strings as math } from '../../math/strings.ts';
import { useChoiceRound } from '../../math/useChoiceRound.ts';
import './addAndSubtract.css';
import type { AddLevel } from './level.ts';
import { strings } from './strings.ts';

interface Thing {
  readonly id: string;
  readonly gone: boolean;
}

function things(prefix: string, count: number, gone: number): Thing[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${String(index)}`,
    gone: index >= count - gone,
  }));
}

/** The things in each card: two cards when adding, one with the last few gone when taking away. */
function cardsOf(level: AddLevel): Thing[][] {
  if (level.operation === 'add') return [things('a', level.first, 0), things('b', level.second, 0)];
  return [things('a', level.first, level.second)];
}

/**
 * Things to count, put together or with some taken away, and numbers to choose from. Touching a
 * thing counts it out loud and puts its number on it. From the middle of the range the number
 * sentence shows too, and at the top it shows alone.
 */
export default function AddAndSubtractActivity({ level, kit }: ActivityProps<AddLevel>) {
  const [counted, setCounted] = useState<readonly string[]>([]);
  const sign = level.operation === 'add' ? math.plus : math.minus;
  const first = numberHandle(level.first);
  const second = numberHandle(level.second);
  const round = useChoiceRound(kit, {
    answer: level.answer,
    sayCorrect: [first, sign, second, math.equals, numberHandle(level.answer)],
  });

  // The shell starts with the adding instruction; taking away and the number sentence replace it.
  useEffect(() => {
    if (level.show === 'things' && level.operation === 'add') return;
    const instruction = level.show === 'things' ? [strings.subtract] : [strings.whatIs, first, sign, second];
    kit.setInstruction(instruction);
  }, [kit, level.show, level.operation, first, sign, second]);

  function count(id: string): void {
    if (counted.includes(id) || round.answered) return;
    const next = [...counted, id];
    setCounted(next);
    kit.play('tap');
    void kit.speak(numberHandle(next.length));
  }

  const cards = cardsOf(level);
  // Cards are only as wide as the larger group needs, up to five across, so a small sum is big.
  const largest = Math.max(...cards.map((card) => card.length));
  const shape = {
    '--cards': cards.length,
    '--cols': Math.min(PER_ROW, largest),
    '--rows': Math.ceil(largest / PER_ROW),
    '--reserve': level.show === 'both' ? 1 : 0,
  } as CSSProperties;

  const sentence = (
    <p className='math-sentence add-sentence'>
      <span>{t(first)}</span>
      <span>{t(sign)}</span>
      <span>{t(second)}</span>
      <span>{t(math.equals)}</span>
      <Blank value={level.answer} filled={round.answered} />
    </p>
  );

  return (
    <div className='math-stage'>
      <div className='math-board add-board' style={shape} data-show={level.show}>
        {level.show !== 'things' && sentence}
        {level.show !== 'sentence' && (
          <div className='add-cards'>
            {cards.map((card, cardIndex) => (
              <div key={cardIndex} className='add-card-slot'>
                {cardIndex > 0 && (
                  <span className='add-sign' aria-hidden='true'>
                    {t(math.plus)}
                  </span>
                )}
                <div className='add-card'>
                  {card.map((thing) => {
                    if (thing.gone) {
                      return (
                        <span key={thing.id} className='add-thing' data-gone='true'>
                          <Emoji id={level.kind} decorative className='add-picture' />
                          <span className='wk-visually-hidden'>{t(strings.gone)}</span>
                        </span>
                      );
                    }
                    const order = counted.indexOf(thing.id);
                    return (
                      <button
                        key={thing.id}
                        type='button'
                        className='add-thing'
                        data-thing={thing.id}
                        aria-pressed={order !== -1}
                        onClick={() => count(thing.id)}
                      >
                        <Emoji id={level.kind} className='add-picture' />
                        {order !== -1 && (
                          <span className='add-badge' data-counted={order + 1}>
                            {t(numberHandle(order + 1))}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <NumberChoices choices={level.choices} round={round} kit={kit} />
    </div>
  );
}
