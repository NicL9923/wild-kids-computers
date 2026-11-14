import { describe, expect, it } from 'vitest';
import type { ContinuousSound } from '../audio/audioEngine.ts';
import { createManualScheduler } from '../core/activityKit/scheduler.ts';
import { createScope } from '../core/activityKit/scope.ts';
import { defineStrings, type SpokenHandle } from '../core/strings/defineStrings.ts';
import { createKit, createTally, type FeedbackOptions, type KitParts } from './kit.ts';

const strings = defineStrings('kit-test', { a: { text: 'A.' }, b: { text: 'B.' } });

/** The audio engine and the shell, recorded. They are the kit's I/O edge. */
function setup(state: KitParts<{ n: number }>['state'] = null) {
  const calls: string[] = [];
  const outcomes: { mistakes: number; hintsUsed: number }[] = [];
  const scope = createScope(createManualScheduler({ wall: 0 }));
  const sound: ContinuousSound = { set: () => undefined, stop: () => calls.push('sound stopped') };
  const tally = createTally();
  const parts: KitParts<{ n: number }> = {
    scope,
    tally,
    state,
    reducedMotion: false,
    pictures: {
      list: () => Promise.reject(new Error('not used')),
      read: () => Promise.reject(new Error('not used')),
    },
    onRoundComplete: (outcome) => outcomes.push(outcome),
    onStepSolved: () => calls.push('step solved'),
    host: {
      clock: { now: () => 0, monotonic: () => 0 },
      activityId: 'kit-test',
      audio: {
        speak: (handle: SpokenHandle) => {
          calls.push(`speak ${handle.id}`);
          return Promise.resolve();
        },
        speakSequence: (handles: readonly SpokenHandle[]) => {
          calls.push(`sequence ${handles.map((h) => h.id).join(' ')}`);
          return Promise.resolve();
        },
        cancelSpeech: () => calls.push('cancel'),
        play: (name) => calls.push(`play ${name}`),
        startContinuous: (name) => {
          calls.push(`start ${name}`);
          return sound;
        },
      },
      onInstruction: (handles, speak, shown) =>
        calls.push(
          `instruction ${handles.map((h) => h.id).join(' ')} ${String(speak)} shows ${shown.map((h) => h.id).join(' ')}`,
        ),
      onFeedback: (kind: string, options: FeedbackOptions) =>
        calls.push(`feedback ${kind}${options.say === undefined ? '' : ` ${options.say.id}`}`),
    },
  };
  return { kit: createKit(parts), parts, calls, outcomes, scope, tally };
}

describe('createKit', () => {
  it('counts wrong answers and hints into the outcome when the round ends', () => {
    const { kit, outcomes, calls } = setup();
    kit.feedback.wrong();
    kit.feedback.correct();
    kit.feedback.wrong({ say: strings.a });
    kit.hint(strings.b);
    kit.roundComplete();
    expect(outcomes).toEqual([{ mistakes: 2, hintsUsed: 1 }]);
    expect(calls).toEqual(['feedback wrong', 'feedback correct', 'feedback wrong kit-test.a', 'speak kit-test.b']);
  });

  it('takes an explicit outcome over the counts, including zero', () => {
    const { kit, outcomes } = setup();
    kit.feedback.wrong();
    kit.roundComplete({ mistakes: 0, hintsUsed: 4 });
    expect(outcomes).toEqual([{ mistakes: 0, hintsUsed: 4 }]);
  });

  it.each([
    [{ mistakes: -1 }, /mistakes as a whole number from 0, not -1/],
    [{ hintsUsed: 1.5 }, /hintsUsed as a whole number from 0, not 1.5/],
  ])('rejects the outcome %j', (outcome, reason) => {
    const { kit, outcomes } = setup();
    expect(() => kit.roundComplete(outcome)).toThrow(reason);
    expect(outcomes).toEqual([]);
  });

  it('ends a round once and ignores feedback and hints after it ends', () => {
    const { kit, outcomes, calls } = setup();
    kit.roundComplete();
    kit.roundComplete();
    kit.feedback.wrong();
    kit.feedback.correct();
    kit.hint(strings.a);
    expect(outcomes).toEqual([{ mistakes: 0, hintsUsed: 0 }]);
    expect(calls).toEqual([]);
  });

  it('keeps the round counts in the tally, so a kit rebuilt mid-round goes on counting', () => {
    const first = setup();
    first.kit.feedback.wrong();
    const rebuilt = createKit({ ...first.parts, state: { value: { n: 1 }, loaded: true, update: () => undefined } });
    rebuilt.feedback.wrong();
    rebuilt.roundComplete();
    expect(first.outcomes).toEqual([{ mistakes: 2, hintsUsed: 0 }]);
    first.kit.roundComplete();
    expect(first.outcomes).toHaveLength(1);
  });

  it('speaks, plays, and changes the instruction while the round is alive', async () => {
    const { kit, calls } = setup();
    await kit.speak(strings.a);
    await kit.speakSequence([strings.a, strings.b]);
    kit.play('pop');
    kit.setInstruction(strings.b);
    kit.setInstruction([strings.a, strings.b], { speak: false });
    kit.setInstruction([strings.a, strings.b], { shown: strings.a });
    expect(calls).toEqual([
      'speak kit-test.a',
      'sequence kit-test.a kit-test.b',
      'play pop',
      'instruction kit-test.b true shows kit-test.b',
      'instruction kit-test.a kit-test.b false shows kit-test.a kit-test.b',
      'instruction kit-test.a kit-test.b true shows kit-test.a',
    ]);
  });

  it('rejects an empty instruction', () => {
    expect(() => setup().kit.setInstruction([])).toThrow(/at least one string\./);
  });

  it('rejects an instruction that shows nothing', () => {
    expect(() => setup().kit.setInstruction(strings.a, { shown: [] })).toThrow(/at least one string to show/);
  });

  it('does nothing once the round scope is disposed', async () => {
    const { kit, calls, scope, outcomes } = setup();
    scope.dispose();
    await kit.speak(strings.a);
    await kit.speakSequence([strings.a]);
    kit.play('pop');
    kit.setInstruction(strings.a);
    kit.feedback.wrong();
    kit.feedback.correct();
    kit.hint(strings.a);
    kit.roundComplete();
    kit.stepSolved();
    expect(calls).toEqual([]);
    expect(outcomes).toEqual([]);
  });

  it('stops a continuous sound when the round ends', () => {
    const { kit, calls, scope } = setup();
    kit.startSound('brush');
    expect(calls).toEqual(['start brush']);
    scope.dispose();
    expect(calls).toEqual(['start brush', 'sound stopped']);
  });

  it('gives the saved state, and names the activity when it declares none', () => {
    expect(setup({ value: { n: 3 }, loaded: true, update: () => undefined }).kit.state.value).toEqual({ n: 3 });
    expect(() => setup(null).kit.state).toThrow(/Activity kit-test uses kit.state but declares no state/);
  });
});
