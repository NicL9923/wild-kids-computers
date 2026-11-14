// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ActivityKit, FeedbackOptions } from '../../../activityShell/kit.ts';
import { createManualScheduler, type ManualScheduler } from '../../../core/activityKit/scheduler.ts';
import { createScope } from '../../../core/activityKit/scope.ts';
import type { SpokenHandle } from '../../../core/strings/defineStrings.ts';
import { feedback, numberHandle } from '../../../core/strings/shared/index.ts';
import { useChoiceRound } from './useChoiceRound.ts';

/** What the round asked the kit to do, in order. The kit is the round's edge to the shell. */
type KitCall =
  | { call: 'correct' | 'wrong'; say: string | null }
  | { call: 'hint'; say: string | null }
  | { call: 'say'; ids: string[] }
  | { call: 'round-complete' };

const unexpected = (name: string) => () => {
  throw new Error(`The choice round should not call kit.${name}`);
};

const said = (options?: FeedbackOptions) => options?.say?.id ?? null;

function fakeKit(scheduler: ManualScheduler): { kit: ActivityKit; calls: KitCall[] } {
  const calls: KitCall[] = [];
  const kit: ActivityKit = {
    scope: createScope(scheduler),
    clock: scheduler,
    reducedMotion: false,
    speak: unexpected('speak'),
    speakSequence: (handles: readonly SpokenHandle[]) => {
      calls.push({ call: 'say', ids: handles.map((handle) => handle.id) });
      return Promise.resolve();
    },
    setInstruction: unexpected('setInstruction'),
    play: unexpected('play'),
    startSound: unexpected('startSound'),
    feedback: {
      correct: (options) => calls.push({ call: 'correct', say: said(options) }),
      wrong: (options) => calls.push({ call: 'wrong', say: said(options) }),
    },
    hint: (say) => calls.push({ call: 'hint', say: say?.id ?? null }),
    roundComplete: () => calls.push({ call: 'round-complete' }),
    get state(): never {
      throw new Error('The choice round has no state');
    },
    pictures: { list: unexpected('pictures.list'), read: unexpected('pictures.read') },
  };
  return { kit, calls };
}

const button = () => document.createElement('button');
const sayCorrect = [numberHandle(4), feedback.thatsIt];

function setup() {
  const scheduler = createManualScheduler({ wall: 0 });
  const { kit, calls } = fakeKit(scheduler);
  const hook = renderHook(() => useChoiceRound(kit, { answer: 4, sayCorrect }));
  const choose = (choice: number) => act(() => hook.result.current.choose(choice, button()));
  return { scheduler, calls, hook, choose };
}

describe('useChoiceRound', () => {
  it('sets a wrong choice aside with a neutral line and keeps the round going', () => {
    const { calls, hook, choose } = setup();
    choose(3);
    expect(calls).toEqual([{ call: 'wrong', say: feedback.tryAnother.id }]);
    expect(hook.result.current.lookOf(3)).toBe('tried');
    expect(hook.result.current.lookOf(4)).toBe('open');
    expect(hook.result.current.answered).toBe(false);
  });

  it('ignores a choice already tried, so one mistake is counted once', () => {
    const { calls, choose } = setup();
    choose(3);
    choose(3);
    expect(calls.filter((entry) => entry.call === 'wrong')).toHaveLength(1);
  });

  it('shows the answer more plainly after two wrong tries, and counts that as a hint', () => {
    const { calls, hook, choose } = setup();
    choose(3);
    choose(5);
    // The second wrong try says nothing itself, so "Here it is" is not cut off.
    expect(calls).toEqual([
      { call: 'wrong', say: feedback.tryAnother.id },
      { call: 'wrong', say: null },
      { call: 'hint', say: feedback.hereItIs.id },
    ]);
    expect(hook.result.current.hinted).toBe(true);
    expect(hook.result.current.lookOf(4)).toBe('hint');
    choose(6);
    expect(calls.filter((entry) => entry.call === 'hint')).toHaveLength(1);
  });

  it('confirms the right choice, says it, and ends the round after a pause', () => {
    const { scheduler, calls, hook, choose } = setup();
    choose(3);
    choose(4);
    expect(calls.slice(1)).toEqual([
      { call: 'correct', say: null },
      { call: 'say', ids: sayCorrect.map((handle) => handle.id) },
    ]);
    expect(hook.result.current.lookOf(4)).toBe('answer');
    expect(hook.result.current.lookOf(3)).toBe('tried');
    expect(hook.result.current.lookOf(5)).toBe('done');
    expect(hook.result.current.hinted).toBe(false);
    scheduler.advance(1399);
    expect(calls.at(-1)?.call).toBe('say');
    scheduler.advance(1);
    expect(calls.at(-1)).toEqual({ call: 'round-complete' });
    // Nothing more happens once the answer is found.
    choose(5);
    choose(4);
    expect(calls.at(-1)).toEqual({ call: 'round-complete' });
  });
});
