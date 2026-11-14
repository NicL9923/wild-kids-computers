// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createManualScheduler, type ManualScheduler } from '../../../../core/activityKit/scheduler.ts';
import { createScope } from '../../../../core/activityKit/scope.ts';
import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { feedback } from '../../../../core/strings/shared/index.ts';
import type { FeedbackOptions } from '../../../../activityShell/kit.ts';
import { generateLevel } from '../open-and-close/level.ts';
import { openCloseSteps } from '../open-and-close/steps.ts';
import { strings } from '../open-and-close/strings.ts';
import { HINT_AFTER_TRIES, LESSON_DONE_PAUSE_MS, LessonDesktop, type LessonKit } from './LessonDesktop.tsx';

/** What the kit was asked to do, in order. The kit is the lesson's edge to the shell. */
type KitCall =
  | { call: 'instruction'; ids: string[] }
  | { call: 'correct'; say: string | null }
  | { call: 'wrong'; say: string | null }
  | { call: 'hint'; say: string | null }
  | { call: 'round-complete' };

const said = (options?: FeedbackOptions) => options?.say?.id ?? null;

function fakeKit(scheduler: ManualScheduler): { kit: LessonKit; calls: KitCall[] } {
  const calls: KitCall[] = [];
  const kit: LessonKit = {
    scope: createScope(scheduler),
    play: () => undefined,
    speak: () => Promise.resolve(),
    pictures: {
      list: () => Promise.reject(new Error('The lesson has no pictures to list')),
      read: () => Promise.reject(new Error('The lesson has no pictures to read')),
    },
    setInstruction: (instruction) => {
      const handles: readonly SpokenHandle[] = Array.isArray(instruction) ? instruction : [instruction];
      calls.push({ call: 'instruction', ids: handles.map((handle) => handle.id) });
    },
    feedback: {
      correct: (options) => calls.push({ call: 'correct', say: said(options) }),
      wrong: (options) => calls.push({ call: 'wrong', say: said(options) }),
    },
    hint: (say) => calls.push({ call: 'hint', say: say?.id ?? null }),
    roundComplete: () => calls.push({ call: 'round-complete' }),
  };
  return { kit, calls };
}

/** A round with four icons on band-6-8: one target and three other apps. */
const level = generateLevel(31, 4, 'band-6-8');
const other = level.icons.find((app) => app !== level.app) ?? 'calculator';

const icon = (container: HTMLElement, app: string) => {
  const found = container.querySelector<HTMLElement>(`[data-desktop-icon="app:${app}"]`);
  if (found === null) throw new Error(`no icon for ${app}`);
  return found;
};

const closeOf = (container: HTMLElement, app: string) => {
  const found = container.querySelector<HTMLElement>(`[data-app="${app}"] [data-window-control="close"]`);
  if (found === null) throw new Error(`no window for ${app}`);
  return found;
};

describe('the lesson harness, running open and close', () => {
  let scheduler: ManualScheduler;

  beforeEach(() => {
    scheduler = createManualScheduler({ wall: Date.UTC(2026, 10, 14) });
    // jsdom has no layout. The desktop measures nothing and keeps its starting size.
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

  async function start() {
    const fake = fakeKit(scheduler);
    const view = render(<LessonDesktop level={level} band='band-6-8' kit={fake.kit} steps={openCloseSteps(level)} />);
    // The first step's instruction waits for the shell's own instruction to be set.
    await act(() => Promise.resolve());
    return { ...fake, container: view.container };
  }

  it('says the first step, then the next step when the first is done', async () => {
    const { calls, container } = await start();
    expect(calls[0]).toEqual({ call: 'instruction', ids: [expect.stringContaining('open-and-close.open')] });
    fireEvent.click(icon(container, level.app));
    expect(calls.slice(1)).toEqual([
      { call: 'correct', say: null },
      { call: 'instruction', ids: [strings.close.id] },
    ]);
    expect(container.querySelector('[data-lesson-step]')?.getAttribute('data-lesson-step')).toBe('1');
  });

  it('nudges each wrong try, then points at the right icon and counts one hint', async () => {
    const { calls, container } = await start();
    for (let tries = 0; tries < HINT_AFTER_TRIES; tries += 1) {
      fireEvent.click(icon(container, other));
      fireEvent.click(closeOf(container, other));
    }
    expect(calls.filter((entry) => entry.call === 'wrong')).toEqual([
      { call: 'wrong', say: feedback.tryAnother.id },
      { call: 'wrong', say: feedback.tryAnother.id },
    ]);
    expect(calls.filter((entry) => entry.call === 'hint')).toEqual([{ call: 'hint', say: feedback.hereItIs.id }]);
    expect(icon(container, level.app).getAttribute('data-highlight')).toBe('true');
    // A third wrong try is nudged again but counts no second hint.
    fireEvent.click(icon(container, other));
    expect(calls.filter((entry) => entry.call === 'hint')).toHaveLength(1);
    // The pointer goes away when the step is done.
    fireEvent.click(icon(container, level.app));
    expect(icon(container, level.app).getAttribute('data-highlight')).toBe('false');
  });

  it('ends the round after the last step, once the child has seen it land', async () => {
    const { calls, container } = await start();
    fireEvent.click(icon(container, level.app));
    fireEvent.click(closeOf(container, level.app));
    expect(calls.at(-1)).toEqual({ call: 'correct', say: feedback.youDidIt.id });
    act(() => scheduler.advance(LESSON_DONE_PAUSE_MS - 1));
    expect(calls.some((entry) => entry.call === 'round-complete')).toBe(false);
    act(() => scheduler.advance(1));
    expect(calls.filter((entry) => entry.call === 'round-complete')).toHaveLength(1);
    // Nothing the child does after the last step counts.
    fireEvent.click(icon(container, other));
    expect(calls.filter((entry) => entry.call === 'wrong')).toEqual([]);
  });
});
