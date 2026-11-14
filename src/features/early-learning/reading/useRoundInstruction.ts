import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ActivityKit } from '../../../activityShell/kit.ts';
import type { SpokenHandle, StringHandle } from '../../../core/strings/defineStrings.ts';

/**
 * Makes this round's instruction the definition's sentence followed by what the round is about,
 * such as "Which letter makes this sound?" and the sound. Replay then says both. `shown` is what
 * the instruction line shows from band-6-8 up; leave out the part that would give the answer
 * away, such as the letter itself.
 *
 * The shell speaks the main instruction in an effect that runs after the activity's own effects,
 * so this waits a microtask for it, as the robot painter does. The new instruction cuts the old
 * one off, so the child hears the whole instruction once. A round component is remounted for
 * each round, so this runs once per round even when the kit is rebuilt.
 */
export function useRoundInstruction(
  kit: Pick<ActivityKit<unknown>, 'scope' | 'setInstruction'>,
  spoken: readonly SpokenHandle[],
  shown: readonly StringHandle[] = spoken,
): void {
  const live = useRef({ kit, spoken, shown });
  useLayoutEffect(() => {
    live.current = { kit, spoken, shown };
  });
  useEffect(() => {
    queueMicrotask(() => {
      const now = live.current;
      if (!now.kit.scope.disposed) now.kit.setInstruction(now.spoken, { shown: now.shown });
    });
  }, []);
}
