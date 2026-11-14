import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ActivityKit } from './kit.ts';

/**
 * Key presses for activities that teach the keyboard. The activity listens on the whole window,
 * so a child does not have to click anything first, but a focused control keeps the keys that
 * press it or move focus. A keyboard user can always Tab to the exit, replay, and mute controls
 * and press them.
 */

/** Keys a focused button or link uses itself: pressing it, or moving focus away. */
const CONTROL_KEYS = new Set(['Enter', ' ', 'Tab']);

const CONTROL_SELECTOR = 'button, a[href], summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"]';
const TEXT_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

export interface ActivityKeyOptions {
  /**
   * Take Tab too, when focus is not on a control. Only for an activity where any key is the
   * answer, such as Any key party, so a child pressing keys at random keeps the focus where it is.
   */
  readonly takeTab?: boolean;
}

/** The parts of a key event the decision reads. */
export interface KeyFacts {
  readonly key: string;
  readonly target: EventTarget | null;
  readonly defaultPrevented: boolean;
}

/**
 * Whether a key press belongs to the activity. A text field keeps every key. A focused control
 * keeps Enter, Space, and Tab. Tab moves focus unless `takeTab`. A press something else already
 * handled, such as a carried item's arrow key, is not the activity's.
 */
export function activityOwnsKey(event: KeyFacts, options: ActivityKeyOptions = {}): boolean {
  if (event.defaultPrevented) return false;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(TEXT_SELECTOR) != null) return false;
  if (target?.closest(CONTROL_SELECTOR) != null && CONTROL_KEYS.has(event.key)) return false;
  if (event.key === 'Tab') return options.takeTab === true;
  return true;
}

/**
 * Calls `onKey` for every key press the activity owns, from the window, for as long as the round
 * lasts. The listener lives in the kit's scope, so leaving the round removes it.
 */
export function useActivityKeys(
  kit: Pick<ActivityKit<unknown>, 'scope'>,
  onKey: (event: KeyboardEvent) => void,
  options: ActivityKeyOptions = {},
): void {
  const handler = useRef(onKey);
  useLayoutEffect(() => {
    handler.current = onKey;
  });
  const takeTab = options.takeTab === true;
  useEffect(
    () =>
      kit.scope.listen(window, 'keydown', (event: KeyboardEvent) => {
        if (activityOwnsKey(event, { takeTab })) handler.current(event);
      }),
    [kit.scope, takeTab],
  );
}
