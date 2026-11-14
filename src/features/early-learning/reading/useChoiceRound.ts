import { useState } from 'react';
import type { ActivityKit } from '../../../activityShell/kit.ts';
import type { SpokenHandle } from '../../../core/strings/defineStrings.ts';
import { strings as feedback } from '../../../core/strings/shared/feedback.ts';

/** The wait after the right answer, so the child hears it land before the next round. */
export const ANSWER_PAUSE_MS = 1400;

/** Wrong tries before the answer is shown more plainly. Counted as a hint. */
export const HINT_AFTER_TRIES = 2;

type RoundKit = Pick<ActivityKit<unknown>, 'feedback' | 'hint' | 'speakSequence' | 'scope' | 'roundComplete'>;

export interface ChoiceRound<K> {
  readonly tried: ReadonlySet<K>;
  readonly answered: boolean;
  /** True after HINT_AFTER_TRIES wrong tries: the answer stands out. */
  readonly hinted: boolean;
  readonly choose: (choice: K, element: HTMLElement) => void;
}

export interface ChoiceRoundOptions<K> {
  /** What to say when the child picks the answer, such as the letter and its sound. */
  readonly onRight: readonly SpokenHandle[];
  /** What to say before "Try another one." after a wrong pick, such as the name of what was picked. */
  readonly onWrong?: (choice: K) => readonly SpokenHandle[];
}

/**
 * One pick-the-answer round. The right answer gets the kit's check mark and ends the round after
 * a pause. A wrong pick is set aside with the kit's neutral nudge and the round goes on. After
 * two wrong picks the answer stands out, and the kit counts a hint.
 */
export function useChoiceRound<K>(kit: RoundKit, answer: K, options: ChoiceRoundOptions<K>): ChoiceRound<K> {
  const [tried, setTried] = useState<ReadonlySet<K>>(() => new Set());
  const [answered, setAnswered] = useState(false);
  const hinted = !answered && tried.size >= HINT_AFTER_TRIES;

  function choose(choice: K, element: HTMLElement): void {
    if (answered || tried.has(choice)) return;
    if (choice === answer) {
      setAnswered(true);
      kit.feedback.correct({ at: element });
      void kit.speakSequence(options.onRight);
      kit.scope.setTimeout(() => kit.roundComplete(), ANSWER_PAUSE_MS);
      return;
    }
    const next = new Set(tried).add(choice);
    setTried(next);
    kit.feedback.wrong({ at: element });
    // The second wrong pick brings the hint, which speaks for itself. Before it, say what was
    // picked and move on.
    if (next.size === HINT_AFTER_TRIES) kit.hint(feedback.hereItIs);
    else void kit.speakSequence([...(options.onWrong?.(choice) ?? []), feedback.tryAnother]);
  }

  return { tried, answered, hinted, choose };
}
