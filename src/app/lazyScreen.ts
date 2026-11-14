import { lazyRouteComponent, type AsyncRouteComponent } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { withDeadline } from '../core/activityKit/deadline.ts';
import { systemScheduler, type Scheduler } from '../core/activityKit/scheduler.ts';

/**
 * How long a screen's code may take to load, in milliseconds. It is a chunk of the app's own
 * bundle, read from the local disk in milliseconds, so this passes only when something is wrong.
 */
export const SCREEN_LOAD_DEADLINE_MS = 10_000;

/** Real time: a test that pins the kit clock cannot stop the deadline. */
const realTime = systemScheduler();

/**
 * A screen loaded on first use, for a route or a part of a screen. Every lazy screen goes through
 * here, and a lint rule bans the bare loaders, so none can wait forever. A load that fails or
 * misses SCREEN_LOAD_DEADLINE_MS throws to the router, whose default error screen offers to try
 * again; trying again loads afresh, and a load that answers after its deadline is dropped.
 */
export function lazyScreen<P extends object>(
  importer: () => Promise<{ default: (props: P) => ReactNode }>,
  timers: Pick<Scheduler, 'setTimeout'> = realTime,
): AsyncRouteComponent<P> {
  return lazyRouteComponent(() => withDeadline(importer(), SCREEN_LOAD_DEADLINE_MS, timers, 'Loading a screen'));
}
