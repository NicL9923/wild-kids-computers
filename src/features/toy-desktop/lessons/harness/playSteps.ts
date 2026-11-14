/**
 * Plays a lesson's steps against the model without React, the way `LessonDesktop` does: after
 * each action the current step is checked, a done step moves on, and a wrong try is counted. A
 * lesson's level test feeds it the actions a child would take and asserts where the round got.
 */
import { createToyClipboard } from '../../../../app/inputGuards.ts';
import { reduce, type DesktopAction, type DesktopEnv } from '../../model/desktop.ts';
import type { DesktopState } from '../../model/state.ts';
import type { HighlightTarget } from '../../desktop/parts.ts';
import type { LessonStep } from './lesson.ts';
import { startSteps, stepAfter } from './stepWalk.ts';

export interface StepsPlayed {
  /** The desktop after the last action. */
  readonly state: DesktopState;
  /** How many steps are done. Equal to the number of steps when the round is complete. */
  readonly done: number;
  /** Wrong tries, counted across every step. */
  readonly wrong: number;
  /** What the harness pointed at after a couple of wrong tries in a step, in order. */
  readonly hints: readonly HighlightTarget[];
  /** How many times the desktop went back to the start of a step the child could no longer finish. */
  readonly restored: number;
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
  let progress = startSteps(start);
  let wrong = 0;
  let restored = 0;
  const hints: HighlightTarget[] = [];
  const rejected: string[] = [];
  for (const next of actions) {
    const action = next(state);
    const transition = reduce(state, action, env);
    state = transition.state;
    for (const event of transition.events) {
      if (event.type === 'rejected') rejected.push(`${event.action}: ${event.reason}`);
    }
    const result = stepAfter(steps, progress, transition, action, env.clipboard);
    progress = result.progress;
    if (result.kind === 'restore') {
      state = progress.start;
      restored += 1;
    } else if (result.kind === 'wrong') {
      wrong += 1;
      if (result.hint !== null) hints.push(result.hint);
    }
  }
  return { state, done: progress.step, wrong, hints, restored, rejected };
}
