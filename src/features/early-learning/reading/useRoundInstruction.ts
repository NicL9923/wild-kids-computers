import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ActivityKit } from '../../../activityShell/kit.ts';
import type { SpokenHandle, StringHandle } from '../../../core/strings/defineStrings.ts';

/**
 * Makes this round's instruction the definition's sentence followed by what the round is about,
 * such as "Which letter makes this sound?" and the sound. Replay then says both. `shown` is what
 * the instruction line shows from band-6-8 up; leave out the part that would give the answer
 * away, such as the letter itself.
 *
 * A round component is remounted for each round, so this runs once per round.
 */
export function useRoundInstruction(
  kit: Pick<ActivityKit<unknown>, 'setInstruction'>,
  spoken: readonly SpokenHandle[],
  shown: readonly StringHandle[] = spoken,
): void {
  const live = useRef({ kit, spoken, shown });
  useLayoutEffect(() => {
    live.current = { kit, spoken, shown };
  });
  useEffect(() => {
    const now = live.current;
    now.kit.setInstruction(now.spoken, { shown: now.shown });
  }, []);
}
