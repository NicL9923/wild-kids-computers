import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ActivityKit, ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t, type SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { feedback } from '../../../../core/strings/shared/index.ts';
import { ANSWER_PAUSE_MS, HINT_AFTER_TRIES, useChoiceRound } from '../../reading/useChoiceRound.ts';
import { useRoundInstruction } from '../../reading/useRoundInstruction.ts';
import './bigAndSmall.css';
import { ROW_WIDTH, type BigAndSmallLevel, type Item, type ItemId } from './level.ts';
import { strings } from './strings.ts';

/** The instruction for the round. */
function instructionFor(level: BigAndSmallLevel): SpokenHandle {
  if (level.mode === 'order') return level.direction === 'small' ? strings.smallToBig : strings.bigToSmall;
  if (level.items.length === 2) return level.direction === 'big' ? strings.bigger : strings.smaller;
  return level.direction === 'big' ? strings.biggest : strings.smallest;
}

/** A picture's box as a share of the row's width, so every size scales together. */
const sizeStyle = (item: Item): CSSProperties => {
  const share = `${String((item.size / ROW_WIDTH) * 100)}cqw`;
  return { width: share, height: share };
};

/**
 * The same picture in a few sizes, standing on one line so sizes compare fairly. "Pick" rounds
 * ask for the bigger or smaller one. "Order" rounds ask the child to click them by size: each
 * one moves down to a second line, so the child sees the row grow in order.
 */
export default function BigAndSmallActivity({ level, kit }: ActivityProps<BigAndSmallLevel>) {
  useRoundInstruction(kit, [instructionFor(level)]);
  return level.mode === 'pick' ? <Pick level={level} kit={kit} /> : <Order level={level} kit={kit} />;
}

function Pick({ level, kit }: { level: BigAndSmallLevel; kit: ActivityKit }) {
  const [answer] = level.answer;
  const round = useChoiceRound<ItemId>(kit, answer, { onRight: [feedback.thatsIt] });
  return (
    <div className='bs-stage' data-mode='pick'>
      <ul className='bs-row' aria-label={t(strings.pictures)}>
        {level.items.map((item) => (
          <li key={item.id} className='bs-spot' style={sizeStyle(item)}>
            <button
              type='button'
              className='bs-item'
              data-item={item.id}
              data-size={item.size}
              data-tried={round.tried.has(item.id)}
              data-answer={round.answered && item.id === answer}
              data-hint={round.hinted && item.id === answer}
              disabled={round.tried.has(item.id) || (round.answered && item.id !== answer)}
              onClick={(event) => round.choose(item.id, event.currentTarget)}
            >
              <Emoji id={level.kind} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Order({ level, kit }: { level: BigAndSmallLevel; kit: ActivityKit }) {
  const [placed, setPlaced] = useState(0);
  // Wrong tries since the last right one. The hint is for the picture the child looks for now.
  const [tries, setTries] = useState(0);
  const done = placed === level.answer.length;
  const wanted = level.answer[placed];
  const hinted = !done && tries >= HINT_AFTER_TRIES;
  const row = useRef<HTMLUListElement | null>(null);
  const lined = level.answer.slice(0, placed);
  const byId = new Map(level.items.map((item) => [item.id, item]));

  // A picture that moved down leaves the row. When it had focus, focus moves to the first
  // picture left, so a keyboard player carries on from there.
  useEffect(() => {
    if (placed === 0 || done) return;
    if (document.activeElement === null || document.activeElement === document.body) {
      row.current?.querySelector('button')?.focus();
    }
  }, [placed, done]);

  function choose(item: ItemId, element: HTMLElement): void {
    if (done || lined.includes(item)) return;
    if (item === wanted) {
      const next = placed + 1;
      setPlaced(next);
      setTries(0);
      kit.feedback.correct({ at: element });
      if (next === level.answer.length) {
        void kit.speak(feedback.youDidIt);
        kit.scope.setTimeout(() => kit.roundComplete(), ANSWER_PAUSE_MS);
      } else {
        kit.play('tap');
      }
      return;
    }
    const nextTries = tries + 1;
    setTries(nextTries);
    kit.feedback.wrong({ at: element });
    if (nextTries === HINT_AFTER_TRIES) kit.hint(feedback.hereItIs);
    else void kit.speak(feedback.tryAnother);
  }

  return (
    <div className='bs-stage' data-mode='order'>
      <ul ref={row} className='bs-row' aria-label={t(strings.pictures)}>
        {level.items.map((item) => (
          <li key={item.id} className='bs-spot' style={sizeStyle(item)}>
            {!lined.includes(item.id) && (
              <button
                type='button'
                className='bs-item'
                data-item={item.id}
                data-size={item.size}
                data-hint={hinted && item.id === wanted}
                onClick={(event) => choose(item.id, event.currentTarget)}
              >
                <Emoji id={level.kind} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <ol className='bs-row bs-line' aria-label={t(strings.line)}>
        {lined.map((id) => {
          const item = byId.get(id);
          return item === undefined ? null : (
            <li key={id} className='bs-spot bs-lined' data-lined={id} style={sizeStyle(item)}>
              <Emoji id={level.kind} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
