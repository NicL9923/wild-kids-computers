import type { ActivityKit } from '../../../activityShell/kit.ts';
import { t } from '../../../core/strings/defineStrings.ts';
import { numberHandle } from '../../../core/strings/shared/index.ts';
import { strings } from './strings.ts';
import type { ChoiceRound } from './useChoiceRound.ts';

export interface NumberChoicesProps {
  readonly choices: readonly number[];
  readonly round: ChoiceRound<number>;
  readonly kit: ActivityKit;
}

/**
 * A row of big numeral buttons. Each one says its number when the pointer rests on it or it gets
 * focus, so a child who cannot read the numeral still knows what it is.
 */
export function NumberChoices({ choices, round, kit }: NumberChoicesProps) {
  return (
    <fieldset className='math-choices' aria-label={t(strings.numbers)}>
      {choices.map((choice) => {
        const handle = numberHandle(choice);
        const look = round.lookOf(choice);
        return (
          <button
            key={choice}
            type='button'
            className='math-choice'
            data-choice={choice}
            data-look={look}
            disabled={look === 'tried' || look === 'done'}
            onPointerEnter={() => void kit.speak(handle)}
            onFocus={() => void kit.speak(handle)}
            onClick={(event) => round.choose(choice, event.currentTarget)}
          >
            {t(handle)}
          </button>
        );
      })}
    </fieldset>
  );
}
