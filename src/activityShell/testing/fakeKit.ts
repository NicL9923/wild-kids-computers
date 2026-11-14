import { createManualScheduler, type ManualScheduler } from '../../core/activityKit/scheduler.ts';
import { createScope, type OwnedScope } from '../../core/activityKit/scope.ts';
import type { SpokenHandle } from '../../core/strings/defineStrings.ts';
import type { ActivityKit, KitState, RoundOutcomeInput } from '../kit.ts';

/** What an activity asked the kit to do, in order. The kit is the activity's edge to the shell. */
type KitCall =
  | { readonly call: 'say'; readonly ids: readonly string[] }
  | { readonly call: 'instruction'; readonly ids: readonly string[] }
  | { readonly call: 'play'; readonly name: string }
  | { readonly call: 'correct' | 'wrong'; readonly say: string | null }
  | { readonly call: 'hint'; readonly say: string | null }
  | { readonly call: 'round-complete'; readonly outcome: RoundOutcomeInput | null };

export interface FakeKit<S> {
  readonly kit: ActivityKit<S>;
  readonly calls: KitCall[];
  /** The kit's time. Advance it to run the activity's timers. */
  readonly scheduler: ManualScheduler;
  /** The kit's scope. Disposing it is what leaving the activity does. */
  readonly scope: OwnedScope;
}

const unexpected = (name: string) => () => {
  throw new Error(`This test did not expect kit.${name}`);
};

const ids = (handles: SpokenHandle | readonly SpokenHandle[]) =>
  (Array.isArray(handles) ? handles : [handles]).map((handle: SpokenHandle) => handle.id);

/**
 * A kit for component tests: it records every call, runs on a manual clock, and throws on what
 * the test did not set up, such as saved state or the gallery, so a surprise fails loudly.
 */
export function createFakeKit<S = never>(options: { state?: KitState<S> } = {}): FakeKit<S> {
  const calls: KitCall[] = [];
  const scheduler = createManualScheduler({ wall: 0 });
  const scope = createScope(scheduler);
  const { state } = options;
  const kit: ActivityKit<S> = {
    scope,
    clock: scheduler,
    reducedMotion: false,
    speak: (handle) => {
      calls.push({ call: 'say', ids: [handle.id] });
      return Promise.resolve();
    },
    speakSequence: (handles) => {
      calls.push({ call: 'say', ids: ids(handles) });
      return Promise.resolve();
    },
    setInstruction: (instruction) => calls.push({ call: 'instruction', ids: ids(instruction) }),
    play: (name) => calls.push({ call: 'play', name }),
    startSound: unexpected('startSound'),
    feedback: {
      correct: (feedback) => calls.push({ call: 'correct', say: feedback?.say?.id ?? null }),
      wrong: (feedback) => calls.push({ call: 'wrong', say: feedback?.say?.id ?? null }),
    },
    hint: (say) => calls.push({ call: 'hint', say: say?.id ?? null }),
    roundComplete: (outcome) => calls.push({ call: 'round-complete', outcome: outcome ?? null }),
    get state(): KitState<S> {
      if (state === undefined) throw new Error('This test gave the kit no saved state');
      return state;
    },
    pictures: { list: unexpected('pictures.list'), read: unexpected('pictures.read') },
  };
  return { kit, calls, scheduler, scope };
}
