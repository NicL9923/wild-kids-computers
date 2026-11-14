/**
 * Plays a lesson's steps against the model without React, the way `LessonDesktop` does: after
 * each action the current step is checked, a done step moves on, and a wrong try is counted. A
 * lesson's level test feeds it the actions a child would take and asserts where the round got.
 */
import { createToyClipboard } from '../../../../app/inputGuards.ts';
import { reduce, type DesktopAction, type DesktopEnv } from '../../model/desktop.ts';
import type { DesktopState } from '../../model/state.ts';
import type { HighlightTarget } from '../../desktop/parts.ts';
import { HINT_AFTER_TRIES } from './LessonDesktop.tsx';
import type { LessonStep } from './lesson.ts';

export interface StepsPlayed {
  /** The desktop after the last action. */
  readonly state: DesktopState;
  /** How many steps are done. Equal to the number of steps when the round is complete. */
  readonly done: number;
  /** Wrong tries, counted across every step. */
  readonly wrong: number;
  /** What the harness pointed at after a couple of wrong tries in a step, in order. */
  readonly hints: readonly (HighlightTarget | null)[];
  /** Each action that was refused, with its reason, so a test can tell a typo in its own actions. */
  readonly rejected: readonly string[];
}

/** Applies actions in order and walks the steps as the lesson harness does. */
export function playSteps(
  start: DesktopState,
  steps: readonly LessonStep[],
  actions: readonly ((state: DesktopState) => DesktopAction)[],
  env: DesktopEnv = { clipboard: createToyClipboard() },
): StepsPlayed {
  let state = start;
  let done = 0;
  let wrong = 0;
  let tries = 0;
  const hints: (HighlightTarget | null)[] = [];
  const rejected: string[] = [];
  for (const next of actions) {
    const action = next(state);
    const transition = reduce(state, action, env);
    state = transition.state;
    for (const event of transition.events) {
      if (event.type === 'rejected') rejected.push(`${event.action}: ${event.reason}`);
    }
    const current = steps[done];
    if (current === undefined) continue;
    if (current.done(transition.state, transition.events)) {
      done += 1;
      tries = 0;
      continue;
    }
    if (current.wrong?.(transition, action) !== true) continue;
    wrong += 1;
    tries += 1;
    if (tries === HINT_AFTER_TRIES) hints.push(current.hint?.(transition.state) ?? null);
  }
  return { state, done, wrong, hints, rejected };
}
