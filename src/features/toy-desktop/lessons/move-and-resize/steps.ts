import { hasEvent } from '../../model/goals.ts';
import type { LessonStep } from '../harness/lesson.ts';
import { fitsOutline, isInPlace, WINDOW_ID as windowId, type MoveResizeLevel } from './level.ts';
import { strings } from './strings.ts';

/** Two steps: move the window into the dashed box, then pull its corner to fill the second box. */
export function moveResizeSteps({ place, outline, tolerance }: MoveResizeLevel): LessonStep[] {
  return [
    {
      done: (state) => isInPlace(state, place, tolerance),
      // A move or resize that ends outside the box is a try; the window just stays where it landed.
      wrong: ({ events }) => hasEvent(events, 'window-moved') || hasEvent(events, 'window-resized'),
      nudge: strings.moveCloser,
      hint: () => ({ kind: 'title-bar', windowId }),
    },
    {
      instruction: strings.resize,
      done: (state) => fitsOutline(state, outline, tolerance),
      wrong: ({ events }) => hasEvent(events, 'window-resized') || hasEvent(events, 'window-moved'),
      nudge: strings.resizeCloser,
      hint: () => ({ kind: 'resize', windowId }),
    },
  ];
}
