// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createManualScheduler } from '../../../../core/activityKit/scheduler.ts';
import { createScope } from '../../../../core/activityKit/scope.ts';
import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { feedback } from '../../../../core/strings/shared/index.ts';
import { buildDesktop } from '../../model/build.ts';
import { hasEvent, isAppOpen } from '../../model/goals.ts';
import { strings } from '../open-and-close/strings.ts';
import { LessonDesktop, type LessonKit, type LessonView } from './LessonDesktop.tsx';
import { LESSON_DESKTOP_SIZE, type LessonLevel, type LessonStep } from './lesson.ts';

/** The kit calls a lesson makes, in order: what it said, nudged, and when the round ended. */
type Call = { call: string; say: string | null };

function fakeKit(): { kit: LessonKit; calls: Call[] } {
  const calls: Call[] = [];
  const kit: LessonKit = {
    scope: createScope(createManualScheduler({ wall: Date.UTC(2026, 10, 14) })),
    play: () => undefined,
    speak: () => Promise.resolve(),
    pictures: {
      list: () => Promise.reject(new Error('no pictures')),
      read: () => Promise.reject(new Error('no pictures')),
    },
    setInstruction: (instruction) => {
      const handles: readonly SpokenHandle[] = Array.isArray(instruction) ? instruction : [instruction];
      calls.push({ call: 'instruction', say: handles.map((handle) => handle.id).join(' ') });
    },
    feedback: {
      correct: (options) => calls.push({ call: 'correct', say: options?.say?.id ?? null }),
      wrong: (options) => calls.push({ call: 'wrong', say: options?.say?.id ?? null }),
    },
    hint: (say) => calls.push({ call: 'hint', say: say?.id ?? null }),
    roundComplete: () => calls.push({ call: 'round-complete', say: null }),
  };
  return { kit, calls };
}

const level: LessonLevel = {
  desktop: buildDesktop({ size: LESSON_DESKTOP_SIZE }),
  parts: { icons: [{ app: 'notepad' }, { app: 'calculator' }, { app: 'music-box' }], launcher: [] },
};

/** Open the notepad, then the calculator, then the music box. The music box opening is a wrong try. */
const steps: LessonStep[] = [
  {
    done: (state) => isAppOpen(state, 'notepad'),
    wrong: ({ events }) => hasEvent(events, 'window-opened', (event) => event.app === 'music-box'),
    nudge: feedback.lookAgain,
  },
  { instruction: strings.openCalculator, done: (state) => isAppOpen(state, 'calculator') },
  { instruction: strings.openMusicBox, done: (state) => isAppOpen(state, 'music-box') },
];

function click(container: HTMLElement, app: string): void {
  const icon = container.querySelector<HTMLElement>(`[data-desktop-icon="app:${app}"]`);
  if (icon === null) throw new Error(`no icon for ${app}`);
  fireEvent.click(icon);
}

describe('lesson steps', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = () => undefined;
        disconnect = () => undefined;
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('skips a later step the child already did, and says the first one still to do', () => {
    const { kit, calls } = fakeKit();
    const view = render(<LessonDesktop level={level} band='band-9-12' kit={kit} steps={steps} />);
    click(view.container, 'calculator');
    expect(calls).toEqual([]);
    click(view.container, 'notepad');
    expect(calls).toEqual([
      { call: 'correct', say: null },
      { call: 'instruction', say: strings.openMusicBox.id },
    ]);
    expect(view.container.querySelector('[data-lesson-step]')?.getAttribute('data-lesson-step')).toBe('2');
  });

  it('ends the round when every step after the one just done is already done', () => {
    const { kit, calls } = fakeKit();
    const view = render(<LessonDesktop level={level} band='band-9-12' kit={kit} steps={steps.slice(0, 2)} />);
    click(view.container, 'calculator');
    click(view.container, 'notepad');
    expect(calls).toEqual([{ call: 'correct', say: feedback.youDidIt.id }]);
  });

  it("says the step's own nudge for a wrong try", () => {
    const { kit, calls } = fakeKit();
    const view = render(<LessonDesktop level={level} band='band-9-12' kit={kit} steps={steps} />);
    click(view.container, 'music-box');
    expect(calls).toEqual([{ call: 'wrong', say: feedback.lookAgain.id }]);
  });

  it('draws the backdrop with the step the child is on and the desktop state', () => {
    const { kit } = fakeKit();
    const seen: Omit<LessonView, 'state'>[] = [];
    const backdrop = ({ step, scale, state }: LessonView) => {
      seen.push({ step, scale });
      return <div data-testid='mark' data-windows={state.windows.length} />;
    };
    const view = render(<LessonDesktop level={level} band='band-9-12' kit={kit} steps={steps} backdrop={backdrop} />);
    act(() => click(view.container, 'notepad'));
    expect(seen.at(-1)).toEqual({ step: 1, scale: 1 });
    // The mark sits on the desktop itself, under the windows.
    const mark = view.container.querySelector('.td-desktop > [data-testid="mark"]');
    expect(mark?.getAttribute('data-windows')).toBe('1');
  });
});
