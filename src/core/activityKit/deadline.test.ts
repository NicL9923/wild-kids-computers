import { describe, expect, it } from 'vitest';
import { DeadlineError, withDeadline } from './deadline.ts';
import { createManualScheduler } from './scheduler.ts';

/** A promise the test settles by hand. */
function held<T>() {
  return Promise.withResolvers<T>();
}

describe('withDeadline', () => {
  it('rejects with the work named once the deadline passes, and ignores a late answer', async () => {
    const timers = createManualScheduler({ wall: 0 });
    const work = held<string>();
    const bounded = withDeadline(work.promise, 500, timers, 'Loading the clip');
    let outcome: unknown = 'pending';
    bounded.then(
      (value) => (outcome = value),
      (error: unknown) => (outcome = error),
    );
    timers.advance(499);
    await Promise.resolve();
    expect(outcome).toBe('pending');
    timers.advance(1);
    await expect(bounded).rejects.toThrow(new DeadlineError('Loading the clip', 500));
    expect(outcome).toBeInstanceOf(DeadlineError);
    work.resolve('late');
    await Promise.resolve();
    expect(outcome).toBeInstanceOf(DeadlineError);
  });

  it('resolves with the work and cancels its timer when the work is in time', async () => {
    const timers = createManualScheduler({ wall: 0 });
    const work = held<string>();
    const bounded = withDeadline(work.promise, 500, timers, 'Loading the clip');
    work.resolve('clip');
    await expect(bounded).resolves.toBe('clip');
    expect(timers.pending()).toBe(0);
  });

  it('passes on a failure in time, as an Error even when the work rejected with something else', async () => {
    const timers = createManualScheduler({ wall: 0 });
    const failed = held<string>();
    const bounded = withDeadline(failed.promise, 500, timers, 'Saving');
    failed.reject(new RangeError('disk full'));
    await expect(bounded).rejects.toThrow(new RangeError('disk full'));
    expect(timers.pending()).toBe(0);

    const odd = held<string>();
    const oddly = withDeadline(odd.promise, 500, timers, 'Saving');
    odd.reject('no');
    await expect(oddly).rejects.toThrow(new Error('no'));
  });
});
