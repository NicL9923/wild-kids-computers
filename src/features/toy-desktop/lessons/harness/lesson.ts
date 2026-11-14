/**
 * The pure half of the lesson harness: what a lesson level holds and what a step is. Level files
 * import from here; it has no React, so Playwright can load a lesson's level.ts.
 */
import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import type { DesktopAction, Transition } from '../../model/desktop.ts';
import type { DesktopEvent } from '../../model/events.ts';
import { MIN_DESKTOP_SIZE, type Size } from '../../model/geometry.ts';
import type { DesktopState } from '../../model/state.ts';
import type { DesktopParts, HighlightTarget } from '../../desktop/parts.ts';

/**
 * The desktop size every lesson builds with. Every screen shows at least this much of the
 * desktop, so a window placed inside it is always fully in view.
 */
export const LESSON_DESKTOP_SIZE: Size = MIN_DESKTOP_SIZE;

/** What every lesson level holds. A lesson adds its own fields, such as the app to open. */
export interface LessonLevel {
  /** The starting desktop, from `buildDesktop({ size: LESSON_DESKTOP_SIZE, ... })`. */
  readonly desktop: DesktopState;
  /** The parts of the desktop on screen. Show only what the goal needs. */
  readonly parts?: DesktopParts;
}

/** One small task inside a round. Most lessons have one or two. */
export interface LessonStep {
  /**
   * What the child hears for this step. The replay control says it again. Leave it out on the
   * first step to keep the definition's main instruction.
   */
  readonly instruction?: SpokenHandle | readonly SpokenHandle[];
  /**
   * True when the step is done. Called after every action with the new state and its events, and
   * with no events when the step starts, so a step the child already did on the way is not asked
   * for again. A check that needs an event is never done at the start.
   */
  readonly done: (state: DesktopState, events: readonly DesktopEvent[]) => boolean;
  /**
   * True when an action is a wrong try for this step, such as opening another app. A wrong try
   * gets the kit's neutral nudge and counts toward a hint. Leave it out when nothing is wrong.
   */
  readonly wrong?: (transition: Transition, action: DesktopAction) => boolean;
  /** The control to point at after a couple of wrong tries. Counted as a hint. */
  readonly hint?: (state: DesktopState) => HighlightTarget | null;
  /** What a wrong try says. Defaults to "Try another one.", which suits a choice among things. */
  readonly nudge?: SpokenHandle;
}
