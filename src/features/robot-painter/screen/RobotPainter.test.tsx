// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeKit, type FakeKit } from '../../../activityShell/testing/fakeKit.ts';
import type { Band } from '../../../core/bands.ts';
import { generateLevel } from '../activities/robot-free-draw/level.ts';
import { runProgram } from '../engine/interpreter.ts';
import { draft as d } from '../engine/program.ts';
import { buildProgram } from '../engine/validate.ts';
import { stepPause } from '../timing.ts';
import { RobotPainter } from './RobotPainter.tsx';

afterEach(cleanup);

/** Free play on a router, since "paint it" navigates. The fake kit is the shell. */
async function renderFree(band: Band): Promise<{ fake: FakeKit<never>; view: ReturnType<typeof render> }> {
  const fake = createFakeKit();
  const rootRoute = createRootRoute({ component: Outlet });
  const play = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <RobotPainter mode={{ kind: 'free', free: generateLevel(0, band) }} band={band} kit={fake.kit} />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([play]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const view = render(<RouterProvider router={router} />);
  await waitFor(() => expect(view.container.querySelector('.rp-screen')).not.toBeNull());
  return { fake, view };
}

/** The element a selector finds, or a clear failure. */
function pick(container: HTMLElement, selector: string): Element {
  const found = container.querySelector(selector);
  if (found === null) throw new Error(`nothing matches ${selector}`);
  return found;
}

const checkpoints = (fake: FakeKit<never>) => fake.calls.filter((call) => call.call === 'checkpoint').length;

describe('robot free draw and the session length', () => {
  it('reaches a calm moment after each arrow or color that moves the robot at once', async () => {
    const { fake, view } = await renderFree('band-3-5');
    fireEvent.click(pick(view.container, '[data-arrow="right"]'));
    // The move is shown before the check, so the closing screen never hides it.
    expect(fake.calls.slice(-2)).toEqual([{ call: 'play', name: 'tap' }, { call: 'checkpoint' }]);
    fireEvent.click(pick(view.container, '[data-color="red"]'));
    expect(checkpoints(fake)).toBe(2);
  });

  it('holds the check for the whole run, and reaches a calm moment only when the program ends', async () => {
    const band = 'band-6-8';
    const { fake, view } = await renderFree(band);
    const { container } = view;
    fireEvent.click(pick(container, '[data-end-slot="main"]'));
    // A toolbox block's click adds it; Enter is that click from the keyboard.
    fireEvent.keyDown(pick(container, '[data-tool="move-right"]'), { key: 'Enter' });
    fireEvent.keyDown(pick(container, '[data-tool="move-right"]'), { key: 'Enter' });
    expect(container.querySelectorAll('[data-list="main"] > li > .rp-block')).toHaveLength(2);
    // Carrying a block holds the check too, through useCarry; nothing is carried now.
    expect(fake.holds()).toBe(0);

    fireEvent.click(pick(container, '[data-control="step"]'));
    // Paused part way by "one step" is still a run.
    expect(fake.holds()).toBe(1);
    fireEvent.click(pick(container, '[data-control="go"]'));
    // The run goes on from the step shown, and the robot is still moving.
    expect([fake.holds(), checkpoints(fake)]).toEqual([1, 0]);
    const pause = stepPause(runProgram(buildProgram([d.right(), d.right()]), generateLevel(0, band).world).steps, band);
    await act(async () => {
      fake.scheduler.advance(pause);
    });
    expect([fake.holds(), checkpoints(fake)]).toEqual([0, 1]);
  });
});
