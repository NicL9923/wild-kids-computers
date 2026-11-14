import type { CSSProperties, ReactNode } from 'react';
import type { ActivityKit } from '../../../activityShell/kit.ts';
import type { SpokenHandle } from '../../../core/strings/defineStrings.ts';
import type { ChoiceRound } from '../reading/useChoiceRound.ts';
import './logic.css';

export interface PictureChoice<K extends string> {
  readonly key: K;
  /** The picture. It carries the button's accessible name, such as an Emoji's alt text. */
  readonly picture: ReactNode;
  /** Said when the pointer rests on the choice or it gets focus, so a child who cannot read knows what it is. */
  readonly say: readonly SpokenHandle[];
}

/**
 * A row of big picture buttons for a pick-one round. A wrong pick steps back with a dashed edge,
 * the answer stands out with a thick edge after two tries, and the right pick stays marked. None
 * of these is color alone.
 */
export function PictureChoices<K extends string>({
  items,
  answer,
  round,
  kit,
  label,
}: {
  items: readonly PictureChoice<K>[];
  answer: K;
  round: ChoiceRound<K>;
  kit: Pick<ActivityKit<unknown>, 'speakSequence'>;
  /** The group's accessible name. */
  label: string;
}) {
  return (
    <fieldset className='lg-choices' aria-label={label} style={{ '--lg-count': items.length } as CSSProperties}>
      {items.map((item) => {
        const isTried = round.tried.has(item.key);
        const isAnswer = round.answered && item.key === answer;
        return (
          <button
            key={item.key}
            type='button'
            className='lg-choice'
            data-choice={item.key}
            data-tried={isTried}
            data-answer={isAnswer}
            data-hint={round.hinted && item.key === answer}
            disabled={isTried || (round.answered && !isAnswer)}
            onPointerEnter={() => void kit.speakSequence(item.say)}
            onFocus={() => void kit.speakSequence(item.say)}
            onClick={(event) => round.choose(item.key, event.currentTarget)}
          >
            {item.picture}
          </button>
        );
      })}
    </fieldset>
  );
}
