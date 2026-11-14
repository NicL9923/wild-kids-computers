import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { feedback } from '../../../../core/strings/shared/index.ts';
import type { HighlightTarget } from '../../desktop/parts.ts';
import type { DesktopAction, Transition } from '../../model/desktop.ts';
import { isFaultFixed, type Fault } from '../../model/faults.ts';
import { hasEvent } from '../../model/goals.ts';
import type { LessonStep } from '../harness/lesson.ts';
import type { FixItLevel } from './level.ts';
import { strings } from './strings.ts';

export function faultInstruction(fault: Fault): SpokenHandle {
  switch (fault.kind) {
    case 'sound-muted':
      return strings.soundOff;
    case 'window-minimized':
      return strings.minimized;
    case 'window-behind':
      return strings.behind;
    default:
      return strings.offSide;
  }
}

function hintFor(fault: Fault): HighlightTarget {
  switch (fault.kind) {
    case 'sound-muted':
      return { kind: 'key', key: 'system-sound' };
    case 'window-off-side':
      return { kind: 'title-bar', windowId: fault.windowId };
    default:
      return { kind: 'task', windowId: fault.windowId };
  }
}

/** A try that does not fix the problem, for the step's fault. */
function isWrongTry(fault: Fault, { events }: Transition, action: DesktopAction): boolean {
  switch (fault.kind) {
    case 'sound-muted':
      // Putting windows away or making them bigger does not bring the sound back.
      return hasEvent(events, 'window-minimized') || hasEvent(events, 'window-maximized');
    case 'window-off-side':
      // A carry keeps the whole window inside the desktop, so any move of it is the fix.
      return false;
    default:
      // Choosing another window in the task strip, or putting another window away.
      return (
        (action.type === 'activate-window' && action.windowId !== fault.windowId) ||
        hasEvent(events, 'window-minimized', (event) => event.windowId !== fault.windowId)
      );
  }
}

/** One step per problem, each with its own instruction, done when the problem is fixed any way. */
export function fixSteps({ faults }: FixItLevel): LessonStep[] {
  return faults.map((fault) => ({
    instruction: faultInstruction(fault),
    done: (state) => isFaultFixed(state, fault),
    wrong: (transition, action) => !isFaultFixed(transition.state, fault) && isWrongTry(fault, transition, action),
    nudge: feedback.lookAgain,
    hint: () => hintFor(fault),
  }));
}
