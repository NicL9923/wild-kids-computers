/**
 * A lesson kit for jsdom tests of the desktop and the lesson harness. The kit is the desktop's
 * edge to the shell, so it is faked; everything inside runs for real. Speech is recorded so a
 * test can hear what the desktop said.
 */
import { createManualScheduler, type ManualScheduler } from '../../../../core/activityKit/scheduler.ts';
import { createScope } from '../../../../core/activityKit/scope.ts';
import type { LessonKit } from './LessonDesktop.tsx';

export function fakeLessonKit(scheduler: ManualScheduler = createManualScheduler({ wall: Date.UTC(2026, 10, 14) })): {
  kit: LessonKit;
  spoken: string[];
} {
  const spoken: string[] = [];
  const kit: LessonKit = {
    scope: createScope(scheduler),
    play: () => undefined,
    speak: (handle) => {
      spoken.push(handle.id);
      return Promise.resolve();
    },
    pictures: {
      list: () => Promise.reject(new Error('A lesson desktop lists no pictures')),
      read: () => Promise.reject(new Error('A lesson desktop reads no pictures')),
    },
    setInstruction: () => undefined,
    feedback: { correct: () => undefined, wrong: () => undefined },
    hint: () => undefined,
    roundComplete: () => undefined,
  };
  return { kit, spoken };
}
