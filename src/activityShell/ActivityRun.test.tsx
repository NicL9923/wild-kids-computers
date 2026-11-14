// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SessionProvider } from '../app/session/SessionProvider.tsx';
import { createSessionStore, type SessionStore } from '../app/session/sessionStore.ts';
import { createFakeBridge, type FakeBridge } from '../app/session/testing/fakeBridge.ts';
import { createAudioEngine, type AudioEngine } from '../audio/audioEngine.ts';
import { AudioProvider } from '../audio/AudioProvider.tsx';
import { CONTINUOUS } from '../audio/sfx/continuous.ts';
import { ONE_SHOTS } from '../audio/sfx/oneShots.ts';
import { FakeAudioContext } from '../audio/testing/fakeAudioContext.ts';
import type { Band } from '../core/bands.ts';
import { defineActivity, type ActivityDefinition } from '../core/activityKit/defineActivity.ts';
import { nextDifficulty } from '../core/activityKit/difficulty.ts';
import { roundSeed } from '../core/activityKit/random.ts';
import { BridgeError } from '../core/platform/bridge.ts';
import { documentNames } from '../core/platform/names.ts';
import { appDocument, progressDocument, settingsDocument } from '../core/storage/schemas.ts';
import { defineStrings } from '../core/strings/defineStrings.ts';
import { ActivityRun } from './ActivityRun.tsx';
import type { ActivityProps } from './kit.ts';
import { kitScheduler } from './kitTime.ts';
import { strings as appShellStrings } from '../app/shell/strings.ts';
import { strings as shellStrings } from './strings.ts';
import { ACTIVITY_LOAD_DEADLINE_MS, BETWEEN_ROUNDS_MS, IDLE_CHECK_MS } from './timing.ts';

const strings = defineStrings('run-fixture', {
  title: { text: 'Fixture' },
  goal: { text: 'Plays a fixture.', silent: 'parent' },
  say: { text: 'Do the thing.' },
  other: { text: 'Now the other thing.' },
});

const SEED = 99;
const PROFILE = { id: 'kid', avatarId: 'fox', colorId: 'sky', band: 'band-3-5' } as const;

/** A component that shows its level and lets the test act as the child. */
function Fixture({ level, kit }: ActivityProps<string, { taps: number }>) {
  return (
    <div>
      <p data-testid='level'>{level}</p>
      <button type='button' onClick={() => kit.roundComplete()}>
        done
      </button>
      <button type='button' onClick={() => kit.stepSolved()}>
        solved
      </button>
      <button type='button' onClick={() => kit.checkpoint()}>
        checkpoint
      </button>
      <button type='button' onClick={() => kit.feedback.wrong()}>
        wrong
      </button>
      <button type='button' onClick={() => kit.hint()}>
        hint
      </button>
      <button type='button' onClick={() => kit.setInstruction(strings.other)}>
        change
      </button>
      <button type='button' onClick={() => kit.setInstruction([strings.say, strings.other], { shown: strings.other })}>
        change, showing less
      </button>
      <button type='button' onClick={() => kit.scope.setTimeout(() => void kit.speak(strings.other), 500)}>
        later
      </button>
    </div>
  );
}

function StateFixture({ kit }: ActivityProps<string, { taps: number }>) {
  return (
    <button type='button' onClick={() => kit.state.update((state) => ({ taps: state.taps + 1 }))}>
      {`taps ${String(kit.state.value.taps)}`}
    </button>
  );
}

/** Free play that saves a tap count and calls the session checkpoint and hold when told to. */
function FreeFixture({ kit }: ActivityProps<string, { taps: number }>) {
  const release = useRef<(() => void) | null>(null);
  return (
    <div>
      <button type='button' onClick={() => kit.state.update((state) => ({ taps: state.taps + 1 }))}>
        {`taps ${String(kit.state.value.taps)}`}
      </button>
      <button type='button' onClick={() => kit.checkpoint()}>
        checkpoint
      </button>
      <button type='button' onClick={() => (release.current = kit.holdCheckpoint())}>
        hold
      </button>
      <button type='button' onClick={() => release.current?.()}>
        release
      </button>
    </div>
  );
}

const load = () => Promise.resolve({ default: Fixture });

/** Every kit object a component was given, to prove a re-render reuses the same one. */
const seenKits = new Set<unknown>();

function KitWatcher({ kit }: ActivityProps<string>) {
  const [renders, setRenders] = useState(0);
  seenKits.add(kit);
  return (
    <button type='button' onClick={() => setRenders(renders + 1)}>
      {`rendered ${String(renders)}`}
    </button>
  );
}

/** Everything of the rounds fixture but its id and load. */
function roundsFields(id: string) {
  return {
    id,
    area: 'early-learning',
    order: 1,
    bands: ['band-3-5'],
    goal: strings.goal,
    title: strings.title,
    icon: { emoji: 'flower' },
    inputs: ['click'],
    spoken: [strings.say],
    kind: 'rounds',
    difficulty: { 'band-3-5': { min: 2, max: 5 } },
    roundsPerSession: 2,
    generateLevel: (seed: number, difficulty: number) => `seed ${String(seed)} at ${String(difficulty)}`,
  } as const;
}

const rounds = defineActivity<string>({ ...roundsFields('run-rounds'), load });

const sequence = defineActivity<string>({
  id: 'run-steps',
  area: 'robot-painter',
  order: 1,
  bands: ['band-3-5'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'flower' },
  inputs: ['click'],
  spoken: [strings.say],
  load,
  kind: 'sequence',
  steps: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  stepsDirectory: null,
  generateLevel: (_seed, step) => `step ${String(step)}`,
});

const withState = defineActivity<string, { taps: number }>({
  id: 'run-state',
  area: 'toy-desktop',
  order: 1,
  bands: ['band-3-5'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'flower' },
  inputs: ['click'],
  spoken: [strings.say],
  state: { schema: z.object({ taps: z.int().min(0) }), defaults: () => ({ taps: 0 }) },
  load: () => Promise.resolve({ default: StateFixture }),
  kind: 'free',
  generateLevel: () => 'free',
});

const free = defineActivity<string, { taps: number }>({
  id: 'run-free',
  area: 'toy-desktop',
  order: 1,
  bands: ['band-3-5'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'flower' },
  inputs: ['click'],
  spoken: [strings.say],
  state: { schema: z.object({ taps: z.int().min(0) }), defaults: () => ({ taps: 0 }) },
  load: () => Promise.resolve({ default: FreeFixture }),
  kind: 'free',
  generateLevel: () => 'free',
});

interface Harness {
  store: SessionStore;
  audio: AudioEngine;
  clock: { mono: number };
  path: () => string;
  spoken: () => string[];
  unmount: () => void;
}

async function run(
  definition: ActivityDefinition,
  options: {
    furthestStep?: number;
    sessionMinutes?: number;
    band?: Band;
    voice?: FakeAudioContext;
    /** Seeds or breaks the platform before the session starts. */
    prepare?: (fake: FakeBridge) => void;
  } = {},
): Promise<Harness> {
  const clock = { mono: 0 };
  const progress = progressDocument.defaults();
  if (options.furthestStep !== undefined) {
    progress.activities[definition.id] = { recentRounds: [], daysPracticed: [], furthestStep: options.furthestStep };
  }
  const fake = createFakeBridge({
    documents: {
      app: JSON.stringify({ ...appDocument.defaults(), firstLaunchDone: true, lastActiveProfileId: PROFILE.id }),
      profiles: JSON.stringify({ version: 1, profiles: [PROFILE] }),
      [documentNames.settings(PROFILE.id)]: JSON.stringify({
        ...settingsDocument.defaults(),
        sessionLengthMinutes: options.sessionMinutes ?? null,
      }),
      [documentNames.progress(PROFILE.id)]: JSON.stringify(progress),
    },
    test: { seed: SEED, difficulty: 3 },
  });
  options.prepare?.(fake);
  const audio = createAudioEngine({
    // With a voice, every string has a clip that plays until the test ends it.
    environment: options.voice
      ? {
          createContext: () => options.voice?.asAudioContext() ?? null,
          clipUrl: (clip) => `app://bundle/${clip}`,
          fetchClip: () => Promise.resolve(new ArrayBuffer(8)),
          now: () => 0,
        }
      : {
          createContext: () => null,
          clipUrl: () => undefined,
          fetchClip: () => Promise.reject(new Error('no clips in unit tests')),
          now: () => 0,
        },
    sfx: { oneShots: ONE_SHOTS, continuous: CONTINUOUS },
    testLog: true,
  });
  const store = createSessionStore({
    bridge: fake.bridge,
    audio,
    clock: { now: () => 0, monotonic: () => clock.mono },
  });
  await store.start();

  function Run() {
    return <ActivityRun definition={definition} band={options.band ?? 'band-3-5'} />;
  }
  const rootRoute = createRootRoute({ component: Outlet });
  const routes = ['/play', '/closing', '/area/$areaId'].map((path) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: path === '/play' ? Run : Landed }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ['/play'] }),
  });
  const view = render(
    <SessionProvider store={store}>
      <AudioProvider engine={audio}>
        <RouterProvider router={router} />
      </AudioProvider>
    </SessionProvider>,
  );
  await screen.findByRole('button', { name: shellStrings.replay.text });
  return {
    store,
    audio,
    clock,
    path: () => router.state.location.pathname,
    spoken: () => (audio.testLog ?? []).filter((entry) => entry.kind === 'voice').map((entry) => entry.name),
    unmount: view.unmount,
  };
}

function Landed() {
  return <p>landed</p>;
}

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
async function advance(ms: number): Promise<void> {
  await act(async () => {
    kitScheduler.manual?.advance(ms);
  });
}
const level = () => screen.findByTestId('level');

beforeEach(() => {
  kitScheduler.pin(1_700_000_000_000);
});

afterEach(cleanup);

describe('a rounds activity', () => {
  it('starts at the test difficulty, speaks the instruction, and shows the level from the round seed', async () => {
    const h = await run(rounds);
    expect((await level()).textContent).toBe(`seed ${String(roundSeed(SEED, 0))} at 3`);
    expect(h.spoken()).toContain(strings.say.id);
    click(shellStrings.replay.text);
    expect(h.spoken().filter((id) => id === strings.say.id)).toHaveLength(2);
  });

  it('records a clean round with its level, rests, then plays the next round at the next difficulty', async () => {
    const h = await run(rounds);
    await level();
    click('done');
    await screen.findByTestId('level');
    expect(document.querySelector('.wk-activity-stage')?.getAttribute('data-resting')).toBe('true');
    const recorded = h.store.getSnapshot().progress.activities[rounds.id];
    expect(
      recorded?.recentRounds.map(({ mistakes, hintsUsed, level: played }) => ({ mistakes, hintsUsed, played })),
    ).toEqual([{ mistakes: 0, hintsUsed: 0, played: 3 }]);
    // One clean round is not enough to go up.
    expect(recorded?.difficulty).toBe(3);

    await advance(BETWEEN_ROUNDS_MS - 1);
    expect((await level()).textContent).toBe(`seed ${String(roundSeed(SEED, 0))} at 3`);
    await advance(1);
    expect((await level()).textContent).toBe(`seed ${String(roundSeed(SEED, 1))} at 3`);
    expect(document.querySelector('.wk-activity-stage')?.getAttribute('data-resting')).toBe('false');
  });

  it('waits for the speech in progress before the next round, so no sentence is cut off', async () => {
    const voice = new FakeAudioContext();
    await run(rounds, { voice });
    await level();
    click('done');
    await advance(BETWEEN_ROUNDS_MS);
    // The instruction clip is still playing, so the round rests.
    expect((await level()).textContent).toBe(`seed ${String(roundSeed(SEED, 0))} at 3`);
    await act(async () => {
      for (const source of voice.sources) if (source.started && !source.stopped) source.end();
      await Promise.resolve();
    });
    expect((await level()).textContent).toBe(`seed ${String(roundSeed(SEED, 1))} at 3`);
  });

  it('counts mistakes and hints for the difficulty model, and a second completion in a round does nothing', async () => {
    const h = await run(rounds);
    await level();
    click('wrong');
    click('wrong');
    click('hint');
    click('done');
    click('done');
    const recorded = h.store.getSnapshot().progress.activities[rounds.id];
    expect(recorded?.recentRounds.map(({ mistakes, hintsUsed }) => ({ mistakes, hintsUsed }))).toEqual([
      { mistakes: 2, hintsUsed: 1 },
    ]);
    // Three slips lower the level by one, within the band's range.
    expect(recorded?.difficulty).toBe(nextDifficulty(3, [{ mistakes: 2, hintsUsed: 1, level: 3 }], { min: 2, max: 5 }));
    expect(recorded?.difficulty).toBe(2);
    expect(document.querySelectorAll('.wk-feedback-mark[data-kind="wrong"]')).toHaveLength(2);
  });

  it('shows the calm finish screen after the session rounds, and play again continues the rounds', async () => {
    await run(rounds);
    await level();
    click('done');
    await advance(BETWEEN_ROUNDS_MS);
    await level();
    click('done');
    await advance(BETWEEN_ROUNDS_MS);
    const again = await screen.findByRole('button', { name: shellStrings.playAgain.text });
    expect(screen.getByRole('button', { name: shellStrings.goBack.text })).toBeTruthy();
    fireEvent.click(again);
    // Two clean rounds at 3 raised the level to 4.
    expect((await level()).textContent).toBe(`seed ${String(roundSeed(SEED, 2))} at 4`);
  });

  it('goes back to the area from the finish screen', async () => {
    const h = await run(rounds);
    await level();
    click('done');
    await advance(BETWEEN_ROUNDS_MS);
    await level();
    click('done');
    await advance(BETWEEN_ROUNDS_MS);
    fireEvent.click(await screen.findByRole('button', { name: shellStrings.goBack.text }));
    await screen.findByText('landed');
    expect(h.path()).toBe('/area/early-learning');
  });

  it('lets a round finish when the session time runs out, then goes to the closing screen', async () => {
    const h = await run(rounds, { sessionMinutes: 5 });
    await level();
    h.clock.mono = 6 * 60_000;
    // Time is up during the round, and the round goes on.
    click('wrong');
    expect(h.path()).toBe('/play');
    click('done');
    await advance(BETWEEN_ROUNDS_MS);
    await screen.findByText('landed');
    expect(h.path()).toBe('/closing');
  });

  it('keeps playing while time remains', async () => {
    const h = await run(rounds, { sessionMinutes: 5 });
    await level();
    h.clock.mono = 4 * 60_000;
    click('done');
    await advance(BETWEEN_ROUNDS_MS);
    expect((await level()).textContent).toBe(`seed ${String(roundSeed(SEED, 1))} at 3`);
  });

  it('replays a changed instruction, and the next round starts with the main one again', async () => {
    const h = await run(rounds);
    await level();
    click('change');
    expect(h.spoken().at(-1)).toBe(strings.other.id);
    click(shellStrings.replay.text);
    expect(h.spoken().at(-1)).toBe(strings.other.id);
    click('done');
    await advance(BETWEEN_ROUNDS_MS);
    await level();
    click(shellStrings.replay.text);
    expect(h.spoken().at(-1)).toBe(strings.say.id);
  });

  it('shows only the text it is given while replay says the whole instruction', async () => {
    const h = await run(rounds);
    await level();
    click('change, showing less');
    expect(document.querySelector('.wk-instruction-text')?.textContent).toBe(strings.other.text);
    // Replay starts the whole spoken instruction, which begins with the string the line hides.
    const before = h.spoken().length;
    click(shellStrings.replay.text);
    expect(h.spoken().slice(before)[0]).toBe(strings.say.id);
  });

  it('cancels the activity timers when the child leaves', async () => {
    const h = await run(rounds);
    await level();
    click('later');
    h.unmount();
    await advance(1000);
    expect(h.spoken()).not.toContain(strings.other.id);
    expect(kitScheduler.manual?.pending()).toBe(0);
  });

  it('runs the activity timers while the child stays', async () => {
    const h = await run(rounds);
    await level();
    click('later');
    await advance(500);
    expect(h.spoken()).toContain(strings.other.id);
  });
});

describe('a sequence activity', () => {
  it('goes straight to the first step, records reaching the next, and moves on', async () => {
    const h = await run(sequence);
    expect((await level()).textContent).toBe('step 0');
    click('done');
    expect(h.store.getSnapshot().progress.activities[sequence.id]?.furthestStep).toBe(1);
    await advance(BETWEEN_ROUNDS_MS);
    expect((await level()).textContent).toBe('step 1');
  });

  it('opens the next step as soon as a step is solved, even when the child stays', async () => {
    const h = await run(sequence);
    expect((await level()).textContent).toBe('step 0');
    click('solved');
    expect(h.store.getSnapshot().progress.activities[sequence.id]?.furthestStep).toBe(1);
    await advance(BETWEEN_ROUNDS_MS);
    // Still on the solved step: solving does not end it.
    expect((await level()).textContent).toBe('step 0');
  });

  it('never lowers the furthest step when an earlier step is solved again', async () => {
    const h = await run(sequence, { furthestStep: 2 });
    fireEvent.click(await screen.findByRole('button', { name: '1' }));
    await level();
    click('solved');
    expect(h.store.getSnapshot().progress.activities[sequence.id]?.furthestStep).toBe(2);
  });

  it('lets a child who reached a later step pick any step up to it, and no further', async () => {
    await run(sequence, { furthestStep: 1 });
    // Steps one and two are shown; step three is not reached yet and is not shown at all.
    expect(await screen.findByRole('button', { name: '1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '2' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '3' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect((await level()).textContent).toBe('step 1');
  });

  it('comes back to the picker after the last step', async () => {
    const h = await run(sequence, { furthestStep: 2 });
    fireEvent.click(await screen.findByRole('button', { name: '3' }));
    expect((await level()).textContent).toBe('step 2');
    click('done');
    expect(h.store.getSnapshot().progress.activities[sequence.id]?.furthestStep).toBe(2);
    await advance(BETWEEN_ROUNDS_MS);
    expect(await screen.findByRole('button', { name: '3' })).toBeTruthy();
  });
});

describe('the session length in free play', () => {
  const LIMIT_MINUTES = 5;
  const LIMIT_MS = LIMIT_MINUTES * 60_000;

  async function playFree(): Promise<Harness> {
    const h = await run(free, { sessionMinutes: LIMIT_MINUTES });
    await screen.findByRole('button', { name: 'taps 0' });
    return h;
  }

  it.each([
    ['keeps playing at a checkpoint just before the limit', LIMIT_MS - 1, '/play'],
    ['rests, then shows the closing screen, at a checkpoint once the limit is reached', LIMIT_MS, '/closing'],
  ])('%s', async (_case, playedMs, path) => {
    const h = await playFree();
    h.clock.mono = playedMs;
    click('checkpoint');
    await advance(BETWEEN_ROUNDS_MS - 1);
    expect(h.path()).toBe('/play');
    await advance(1);
    expect(h.path()).toBe(path);
  });

  it('takes no input while it rests before the closing screen, and keeps what the child saved', async () => {
    const h = await playFree();
    click('taps 0');
    h.clock.mono = LIMIT_MS;
    click('checkpoint');
    expect(screen.getByText('taps 1').closest('[inert]')).not.toBeNull();
    await advance(BETWEEN_ROUNDS_MS);
    await screen.findByText('landed');
    expect(h.store.getSnapshot().activityStates[free.id]?.state).toEqual({ taps: 1 });
  });

  it('checks on its own after a while with no input, for an activity that never calls the checkpoint', async () => {
    const h = await playFree();
    h.clock.mono = LIMIT_MS;
    await advance(IDLE_CHECK_MS - 1_000);
    // The child moves the pointer, so the quiet starts again.
    fireEvent.pointerMove(window, { clientX: 10, clientY: 10 });
    await advance(IDLE_CHECK_MS - 1);
    expect(h.path()).toBe('/play');
    await advance(1);
    await advance(BETWEEN_ROUNDS_MS);
    expect(h.path()).toBe('/closing');
  });

  it('keeps waiting for quiet whatever fraction of a millisecond the clock starts at', async () => {
    // The page clock reads fractions. From this start, an idle check that measured the quiet by
    // subtracting clock readings came out a hair short, and its wait of a hair re-ran forever.
    const start = vi.spyOn(performance, 'now').mockReturnValue(1002.6694897427832);
    kitScheduler.pin(1_700_000_000_000);
    start.mockRestore();
    const h = await playFree();
    h.clock.mono = LIMIT_MS;
    await advance(IDLE_CHECK_MS - 1_000);
    fireEvent.keyDown(window, { key: 'a' });
    await advance(IDLE_CHECK_MS);
    await advance(BETWEEN_ROUNDS_MS);
    expect(h.path()).toBe('/closing');
  });

  it('keeps playing after a while with no input while time remains', async () => {
    const h = await playFree();
    h.clock.mono = LIMIT_MS - 1;
    await advance(IDLE_CHECK_MS + BETWEEN_ROUNDS_MS);
    expect(h.path()).toBe('/play');
  });

  it('waits for a hold to let go, then closes', async () => {
    const h = await playFree();
    h.clock.mono = LIMIT_MS;
    click('hold');
    click('checkpoint');
    await advance(IDLE_CHECK_MS * 2 + BETWEEN_ROUNDS_MS);
    expect(h.path()).toBe('/play');
    click('release');
    await advance(BETWEEN_ROUNDS_MS);
    expect(h.path()).toBe('/closing');
  });

  it('throws for a rounds activity, which checks the session between its rounds', async () => {
    await run(rounds);
    await level();
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    click('checkpoint');
    window.removeEventListener('error', onError);
    expect(String(errors[0])).toMatch(/run-rounds is not free play/);
  });
});

describe('stepSolved outside a sequence', () => {
  it('throws for a rounds activity, which has no steps to open', async () => {
    await run(rounds);
    await level();
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    click('solved');
    window.removeEventListener('error', onError);
    expect(String(errors[0])).toMatch(/run-rounds has no steps/);
  });
});

describe('the kit across renders', () => {
  it.each([
    ['rounds', 'run-rounds-watch'],
    ['free', 'run-free-watch'],
  ] as const)('stays the same object when a %s activity renders again', async (kind, id) => {
    const common = {
      id,
      area: 'early-learning',
      order: 1,
      bands: ['band-3-5'],
      goal: strings.goal,
      title: strings.title,
      icon: { emoji: 'flower' },
      inputs: ['click'],
      spoken: [strings.say],
      load: () => Promise.resolve({ default: KitWatcher }),
    } as const;
    const definition =
      kind === 'rounds'
        ? defineActivity<string>({
            ...common,
            kind: 'rounds',
            difficulty: { 'band-3-5': { min: 1, max: 2 } },
            roundsPerSession: 2,
            generateLevel: () => 'level',
          })
        : defineActivity<string>({ ...common, kind: 'free', generateLevel: () => 'free' });
    seenKits.clear();
    await run(definition);
    fireEvent.click(await screen.findByRole('button', { name: 'rendered 0' }));
    fireEvent.click(await screen.findByRole('button', { name: 'rendered 1' }));
    await screen.findByRole('button', { name: 'rendered 2' });
    expect(seenKits.size).toBe(1);
  });
});

describe('an activity with saved state', () => {
  it('reads and updates its state through the session', async () => {
    const h = await run(withState);
    const button = await screen.findByRole('button', { name: 'taps 0' });
    fireEvent.click(button);
    await screen.findByRole('button', { name: 'taps 1' });
    expect(h.store.getSnapshot().activityStates[withState.id]?.state).toEqual({ taps: 1 });
  });

  it('does not start on defaults when its state cannot be read, and starts with the saved state on try again', async () => {
    const name = documentNames.activity(PROFILE.id, withState.id);
    const h = await run(withState, {
      prepare: (fake) => {
        fake.documents.set(name, JSON.stringify({ version: 1, state: { taps: 4 } }));
        fake.failNext('read', name, new BridgeError('io', 'disk busy'));
      },
    });
    await screen.findByRole('heading', { name: shellStrings.notOpened.text });
    expect(h.spoken()).toContain(shellStrings.notOpened.id);
    expect(screen.queryByRole('button', { name: /^taps/ })).toBeNull();

    click(appShellStrings.tryAgain.text);
    await screen.findByRole('button', { name: 'taps 4' });
  });
});

/** A rounds activity whose first load is decided by the test, and whose later loads work. */
function slowToLoad(id: string) {
  const first: { answer: (module: { default: typeof Fixture }) => void; fail: (error: Error) => void } = {
    answer: () => undefined,
    fail: () => undefined,
  };
  let calls = 0;
  const definition = defineActivity<string>({
    ...roundsFields(id),
    load: () => {
      calls += 1;
      if (calls > 1) return Promise.resolve({ default: Fixture });
      return new Promise<{ default: typeof Fixture }>((resolve, reject) => {
        first.answer = resolve;
        first.fail = reject;
      });
    },
  });
  return { definition, first, calls: () => calls };
}

function Broken(): never {
  throw new Error('a bug in the activity');
}

describe('an activity whose component does not load', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a calm screen with the way out and one try again after the deadline, ignores the late load, and plays on try again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const slow = slowToLoad('run-slow');
    const h = await run(slow.definition);
    // Real time also moves these timers a little, so the check before the deadline keeps a margin.
    await act(async () => {
      vi.advanceTimersByTime(ACTIVITY_LOAD_DEADLINE_MS / 2);
    });
    expect(screen.queryByRole('heading', { name: shellStrings.notOpened.text })).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(ACTIVITY_LOAD_DEADLINE_MS / 2);
    });
    await screen.findByRole('heading', { name: shellStrings.notOpened.text });
    expect(h.spoken()).toContain(shellStrings.notOpened.id);
    expect(screen.getByRole('button', { name: shellStrings.exitToArea.text })).toBeDefined();
    expect(screen.getByRole('button', { name: shellStrings.soundOff.text })).toBeDefined();

    // The load that answers after the deadline does not put a game under the screen.
    await act(async () => {
      slow.first.answer({ default: Fixture });
    });
    expect(screen.queryByTestId('level')).toBeNull();

    click(appShellStrings.tryAgain.text);
    expect((await level()).textContent).toBe(`seed ${String(roundSeed(SEED, 0))} at 3`);
    expect(slow.calls()).toBe(2);
  });

  it('shows the same screen when loading fails, and the way out still goes to the area', async () => {
    const slow = slowToLoad('run-broken');
    const h = await run(slow.definition);
    await act(async () => {
      slow.first.fail(new Error('chunk missing'));
    });
    await screen.findByRole('heading', { name: shellStrings.notOpened.text });
    click(shellStrings.exitToArea.text);
    await screen.findByText('landed');
    expect(h.path()).toBe('/area/early-learning');
  });

  it('leaves an error that is not a load failure to the router, instead of offering to load again', async () => {
    const shown: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void shown.push(...args));
    const definition = defineActivity<string>({
      ...roundsFields('run-buggy'),
      load: () => Promise.resolve({ default: Broken }),
    });
    await run(definition).catch(() => undefined);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    spy.mockRestore();
    expect(screen.queryByRole('heading', { name: shellStrings.notOpened.text })).toBeNull();
    expect(shown.some((entry) => String(entry).includes('a bug in the activity'))).toBe(true);
  });
});
