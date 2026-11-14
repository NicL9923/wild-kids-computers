// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  type RouteComponent,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createAudioEngine } from '../audio/audioEngine.ts';
import { AudioProvider } from '../audio/AudioProvider.tsx';
import { CONTINUOUS } from '../audio/sfx/continuous.ts';
import { ONE_SHOTS } from '../audio/sfx/oneShots.ts';
import { createManualScheduler } from '../core/activityKit/scheduler.ts';
import { lazyScreen, SCREEN_LOAD_DEADLINE_MS } from './lazyScreen.ts';
import { HOME_PATH } from './paths.ts';
import { routerDefaults } from './router.ts';
import { strings as shellStrings } from './shell/strings.ts';

afterEach(cleanup);

function Slow() {
  return <p>the screen</p>;
}

/** A screen whose first load answers only when the test says, and whose later loads work. */
function slowScreen() {
  const timers = createManualScheduler({ wall: 0 });
  const first = { answer: (): void => undefined };
  let loads = 0;
  const component = lazyScreen(() => {
    loads += 1;
    if (loads > 1) return Promise.resolve({ default: Slow });
    return new Promise<{ default: typeof Slow }>((resolve) => {
      first.answer = () => resolve({ default: Slow });
    });
  }, timers);
  return { component, timers, first, loads: () => loads };
}

function show(component: RouteComponent) {
  const audio = createAudioEngine({
    environment: {
      createContext: () => null,
      clipUrl: () => undefined,
      fetchClip: () => Promise.reject(new Error('No clips in unit tests.')),
      now: () => 0,
    },
    sfx: { oneShots: ONE_SHOTS, continuous: CONTINUOUS },
    testLog: true,
  });
  const rootRoute = createRootRoute({ component: Outlet });
  const routes = [
    createRoute({ getParentRoute: () => rootRoute, path: '/slow', component }),
    createRoute({ getParentRoute: () => rootRoute, path: HOME_PATH, component: () => <p>meadow</p> }),
  ];
  const router = createRouter({
    ...routerDefaults,
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ['/slow'] }),
  });
  render(
    <AudioProvider engine={audio}>
      <RouterProvider router={router} />
    </AudioProvider>,
  );
  return {
    router,
    spoken: () => (audio.testLog ?? []).filter((entry) => entry.kind === 'voice').map((entry) => entry.name),
  };
}

const flush = () =>
  act(async () => {
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
  });

describe('a lazy screen', () => {
  it('offers a calm try again when its load does not answer in time, ignores the late load, and loads on try again', async () => {
    const slow = slowScreen();
    const view = show(slow.component);
    await flush();
    await act(async () => slow.timers.advance(SCREEN_LOAD_DEADLINE_MS - 1));
    expect(screen.queryByRole('heading', { name: shellStrings.notOpened.text })).toBeNull();
    await act(async () => slow.timers.advance(1));
    await screen.findByRole('heading', { name: shellStrings.notOpened.text });
    expect(view.spoken()).toContain(shellStrings.notOpened.id);

    slow.first.answer();
    await flush();
    expect(screen.queryByText('the screen')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: shellStrings.tryAgain.text }));
    await screen.findByText('the screen');
    expect(slow.loads()).toBe(2);
  });

  it('goes back to the meadow from the try-again screen', async () => {
    const slow = slowScreen();
    const view = show(slow.component);
    await flush();
    await act(async () => slow.timers.advance(SCREEN_LOAD_DEADLINE_MS));
    fireEvent.click(await screen.findByRole('button', { name: shellStrings.backToMeadow.text }));
    await screen.findByText('meadow');
    expect(view.router.state.location.pathname).toBe(HOME_PATH);
  });
});
