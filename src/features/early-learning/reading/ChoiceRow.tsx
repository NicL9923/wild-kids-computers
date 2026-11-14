import type { ActivityKit } from '../../../activityShell/kit.ts';
import type { SpokenHandle } from '../../../core/strings/defineStrings.ts';
import type { ChoiceRound } from './useChoiceRound.ts';
import './reading.css';

export interface ChoiceItem<K extends string> {
  readonly key: K;
  /** What the button shows: a letter or a word. */
  readonly label: string;
  /** Said when the pointer rests on the button or it gets focus. Leave out to stay quiet. */
  readonly say?: SpokenHandle;
}

/**
 * A row of big answer buttons. A wrong pick steps back with a dashed edge, the answer stands out
 * with a thick edge once the round hints at it, and the right pick stays marked. None of these
 * is color alone.
 */
export function ChoiceRow<K extends string>({
  items,
  answer,
  round,
  kit,
  label,
  look,
}: {
  items: readonly ChoiceItem<K>[];
  answer: K;
  round: ChoiceRound<K>;
  kit: Pick<ActivityKit<unknown>, 'speak'>;
  /** The group's accessible name. */
  label: string;
  look: 'letter' | 'word';
}) {
  return (
    <fieldset className='rd-choices' aria-label={label}>
      {items.map((item) => {
        const isTried = round.tried.has(item.key);
        const isAnswer = round.answered && item.key === answer;
        const { say } = item;
        return (
          <button
            key={item.key}
            type='button'
            className='rd-choice'
            data-look={look}
            data-choice={item.key}
            data-tried={isTried}
            data-answer={isAnswer}
            data-hint={round.hinted && item.key === answer}
            disabled={isTried || (round.answered && !isAnswer)}
            onPointerEnter={say === undefined ? undefined : () => void kit.speak(say)}
            onFocus={say === undefined ? undefined : () => void kit.speak(say)}
            onClick={(event) => round.choose(item.key, event.currentTarget)}
          >
            {item.label}
          </button>
        );
      })}
    </fieldset>
  );
}
