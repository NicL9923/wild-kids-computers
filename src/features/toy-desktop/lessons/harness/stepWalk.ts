/**
 * How a lesson's steps move on after each action. `LessonDesktop` and `playSteps` both use it, so
 * a test that plays steps without React walks them exactly as the screen does.
 */
import type { DesktopAction, Transition } from '../../model/desktop.ts';
import type { DesktopState } from '../../model/state.ts';
import type { TextClipboard } from '../../model/textEditor.ts';
import type { HighlightTarget } from '../../desktop/parts.ts';
import type { LessonStep } from './lesson.ts';

/** Wrong tries in one step before the harness points at the answer. */
export const HINT_AFTER_TRIES = 2;

export interface StepProgress {
  /** The index of the step the child is on. Equal to the step count once the round is done. */
  readonly step: number;
  /** Wrong tries in this step. */
  readonly tries: number;
  /** True once this step has pointed at the answer. It points once. */
  readonly hinted: boolean;
  /** The desktop as this step began, put back when the step stops being possible. */
  readonly start: DesktopState;
}

export type StepResult =
  /** The step is done, and any later step that already holds. The round is over when `step` is the step count. */
  | { readonly kind: 'done'; readonly progress: StepProgress }
  /** A wrong try. `hint` is the control to point at when this try is the one that earns a hint. */
  | { readonly kind: 'wrong'; readonly progress: StepProgress; readonly hint: HighlightTarget | null }
  /** The child took away what the step needs. The desktop goes back to `progress.start`. */
  | { readonly kind: 'restore'; readonly progress: StepProgress }
  /** Nothing that counts. */
  | { readonly kind: 'none'; readonly progress: StepProgress };

/** The first step from `from` on that is not done already, or the step count when all are. */
function firstOpenStep(steps: readonly LessonStep[], from: number, state: DesktopState): number {
  let index = from;
  while (index < steps.length && steps[index]?.done(state, []) === true) index += 1;
  return index;
}

/** Where a round starts: the first step, on the starting desktop. */
export function startSteps(desktop: DesktopState): StepProgress {
  return { step: 0, tries: 0, hinted: false, start: desktop };
}

/** What one action means for the round. */
export function stepAfter(
  steps: readonly LessonStep[],
  progress: StepProgress,
  transition: Transition,
  action: DesktopAction,
  clipboard: TextClipboard,
): StepResult {
  const current = steps[progress.step];
  // After the last step there is no current step, so nothing the child does counts.
  if (current === undefined) return { kind: 'none', progress };
  const { state } = transition;
  if (current.done(state, transition.events)) {
    const step = firstOpenStep(steps, progress.step + 1, state);
    return { kind: 'done', progress: { step, tries: 0, hinted: false, start: state } };
  }
  if (current.possible?.(state, clipboard) === false) return { kind: 'restore', progress };
  if (current.wrong?.(transition, action) !== true) return { kind: 'none', progress };
  const tries = progress.tries + 1;
  const target = tries >= HINT_AFTER_TRIES && !progress.hinted ? (current.hint?.(state) ?? null) : null;
  return { kind: 'wrong', progress: { ...progress, tries, hinted: progress.hinted || target !== null }, hint: target };
}
