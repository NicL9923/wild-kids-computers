import type { Scheduler } from './scheduler.ts';

/** Work that did not finish in time. */
export class DeadlineError extends Error {
  readonly ms: number;
  constructor(what: string, ms: number) {
    super(`${what} did not finish within ${ms} ms.`);
    this.name = 'DeadlineError';
    this.ms = ms;
  }
}

/**
 * Settles the way `work` does, or rejects with a DeadlineError once `ms` pass first. Whatever
 * `work` does after that is ignored.
 *
 * Give every promise a deadline when a child's next step waits for it and it settles somewhere
 * this code does not control: a worker, a decoder, a file read, the main process. Pass real time,
 * such as `systemScheduler()`, because the work it bounds runs in real time even when a test pins
 * the kit's clock.
 */
export function withDeadline<T>(
  work: Promise<T>,
  ms: number,
  timers: Pick<Scheduler, 'setTimeout'>,
  what: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cancel = timers.setTimeout(() => reject(new DeadlineError(what, ms)), ms);
    work
      .then(resolve, (error: unknown) => reject(error instanceof Error ? error : new Error(String(error))))
      .finally(cancel);
  });
}
