import { describe, expect, it } from 'vitest';
import { createStudioScope, type TimerHost } from './studioScope.ts';

/** Timers that fire only when the test says so, and remember what is still pending. */
function manualHost() {
  const pending = new Map<number, (time: number) => void>();
  let next = 1;
  const add = (callback: (time: number) => void): (() => void) => {
    const id = next++;
    pending.set(id, callback);
    return () => pending.delete(id);
  };
  const host: TimerHost = {
    setTimeout: (callback) => add(callback),
    setInterval: (callback) => add(callback),
    requestAnimationFrame: (callback) => add(callback),
  };
  return {
    host,
    pending: () => pending.size,
    fireAll: () => {
      for (const [id, callback] of pending) {
        pending.delete(id);
        callback(16);
      }
    },
  };
}

describe('studio scope', () => {
  it('runs a timeout and a frame once, and a cancel before then stops it', () => {
    const timers = manualHost();
    const scope = createStudioScope(timers.host);
    const seen: string[] = [];
    scope.setTimeout(() => seen.push('timeout'), 10);
    scope.requestFrame((time) => seen.push(`frame ${time}`));
    const cancel = scope.setTimeout(() => seen.push('cancelled'), 10);
    cancel();
    expect(timers.pending()).toBe(2);
    timers.fireAll();
    expect(seen).toEqual(['timeout', 'frame 16']);
  });

  it('cancels everything still pending on dispose, and schedules nothing afterwards', () => {
    const timers = manualHost();
    const scope = createStudioScope(timers.host);
    scope.setTimeout(() => undefined, 10);
    scope.setInterval(() => undefined, 10);
    scope.requestFrame(() => undefined);
    scope.dispose();
    expect(timers.pending()).toBe(0);
    expect(scope.disposed).toBe(true);
    const late = scope.setTimeout(() => undefined, 10);
    expect(timers.pending()).toBe(0);
    late();
    scope.dispose();
  });

  it('does not cancel a timer that already fired when the scope is disposed', () => {
    const timers = manualHost();
    const scope = createStudioScope(timers.host);
    let fired = 0;
    const cancel = scope.setTimeout(() => fired++, 10);
    timers.fireAll();
    cancel();
    scope.dispose();
    expect(fired).toBe(1);
  });
});
