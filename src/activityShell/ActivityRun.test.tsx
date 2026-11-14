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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SessionProvider } from '../app/session/SessionProvider.tsx';
import { createSessionStore, type SessionStore } from '../app/session/sessionStore.ts';
import { createFakeBridge } from '../app/session/testing/fakeBridge.ts';
import { createAudioEngine, type AudioEngine } from '../audio/audioEngine.ts';
import { AudioProvider } from '../audio/AudioProvider.tsx';
import { CONTINUOUS } from '../audio/sfx/continuous.ts';
import { ONE_SHOTS } from '../audio/sfx/oneShots.ts';
import type { Band } from '../core/bands.ts';
import { defineActivity, type ActivityDefinition } from '../core/activityKit/defineActivity.ts';
import { nextDifficulty } from '../core/activityKit/difficulty.ts';
import { roundSeed } from '../core/activityKit/random.ts';
import { documentNames } from '../core/platform/names.ts';
import { appDocument, progressDocument, settingsDocument } from '../core/storage/schemas.ts';
import { defineStrings } from '../core/strings/defineStrings.ts';
import { ActivityRun, BETWEEN_ROUNDS_MS } from './ActivityRun.tsx';
import type { ActivityProps } from './kit.ts';
import { kitScheduler } from './kitTime.ts';
import { strings as shellStrings } from './strings.ts';

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
      <button type='button' onClick={() => kit.feedback.wrong()}>
        wrong
      </button>
      <button type='button' onClick={() => kit.hint()}>
        hint
      </button>
      <button type='button' onClick={() => kit.setInstruction(strings.other)}>
        change
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

const load = () => Promise.resolve({ default: Fixture });

const rounds = defineActivity<string>({
  id: 'run-rounds',
  area: 'early-learning',
  order: 1,
  bands: ['band-3-5'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'flower' },
  inputs: ['click'],
  spoken: [strings.say],
  load,
  kind: 'rounds',
  difficulty: { 'band-3-5': { min: 2, max: 5 } },
  roundsPerSession: 2,
  generateLevel: (seed, difficulty) => `seed ${String(seed)} at ${String(difficulty)}`,
});

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
  options: { furthestStep?: number; sessionMinutes?: number; band?: Band } = {},
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
  const audio = createAudioEngine({
    environment: {
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

describe('an activity with saved state', () => {
  it('reads and updates its state through the session', async () => {
    const h = await run(withState);
    const button = await screen.findByRole('button', { name: 'taps 0' });
    fireEvent.click(button);
    await screen.findByRole('button', { name: 'taps 1' });
    expect(h.store.getSnapshot().activityStates[withState.id]?.state).toEqual({ taps: 1 });
  });
});
