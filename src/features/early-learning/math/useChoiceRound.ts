import { useState } from 'react';
import type { ActivityKit } from '../../../activityShell/kit.ts';
import type { SpokenHandle } from '../../../core/strings/defineStrings.ts';
import { feedback } from '../../../core/strings/shared/index.ts';

/** Wrong tries before the right answer is shown more plainly. The second one counts as a hint. */
const WRONG_BEFORE_HINT = 2;

/** The wait after the right answer, so the child hears it before the next round. */
const ANSWER_PAUSE_MS = 1400;

/** How a choice looks now: open to try, set aside after a wrong try, the answer, or done. */
type ChoiceLook = 'open' | 'tried' | 'hint' | 'answer' | 'done';

export interface ChoiceRound<T> {
  readonly answered: boolean;
  /** True once the right answer is shown more plainly. */
  readonly hinted: boolean;
  readonly lookOf: (choice: T) => ChoiceLook;
  readonly choose: (choice: T, element: HTMLElement) => void;
}

export interface ChoiceRoundOptions<T> {
  readonly answer: T;
  /** What to say after the right choice, such as the number and "That's it." */
  readonly sayCorrect: readonly SpokenHandle[];
  /** Runs once with the right choice, before the round ends. */
  readonly onCorrect?: () => void;
}

/**
 * One round of "pick the right one". A wrong choice is set aside with the kit's neutral nudge and
 * the round goes on. After two wrong tries the right answer is shown more plainly, which counts
 * as a hint. The right choice gets the kit's confirmation, and the round ends after a pause.
 */
export function useChoiceRound<T>(kit: ActivityKit, options: ChoiceRoundOptions<T>): ChoiceRound<T> {
  const [tried, setTried] = useState<readonly T[]>([]);
  const [answered, setAnswered] = useState(false);
  const hinted = !answered && tried.length >= WRONG_BEFORE_HINT;

  function choose(choice: T, element: HTMLElement): void {
    if (answered || tried.includes(choice)) return;
    if (choice === options.answer) {
      setAnswered(true);
      kit.feedback.correct({ at: element });
      void kit.speakSequence(options.sayCorrect);
      options.onCorrect?.();
      kit.scope.setTimeout(() => kit.roundComplete(), ANSWER_PAUSE_MS);
      return;
    }
    const next = [...tried, choice];
    setTried(next);
    if (next.length === WRONG_BEFORE_HINT) {
      kit.feedback.wrong({ at: element });
      kit.hint(feedback.hereItIs);
    } else {
      kit.feedback.wrong({ at: element, say: feedback.tryAnother });
    }
  }

  function lookOf(choice: T): ChoiceLook {
    if (tried.includes(choice)) return 'tried';
    if (choice === options.answer) return answered ? 'answer' : hinted ? 'hint' : 'open';
    return answered ? 'done' : 'open';
  }

  return { answered, hinted, lookOf, choose };
}
