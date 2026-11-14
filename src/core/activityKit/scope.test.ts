import { describe, expect, it } from 'vitest';
import { createManualScheduler } from './scheduler.ts';
import { createScope, type ListenerTarget } from './scope.ts';

/** A listener target that records what is attached, standing in for an element. */
function fakeTarget() {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const target: ListenerTarget & { fire(type: string, event: object): void; count(type: string): number } = {
    addEventListener(type, listener) {
      if (listener === null) return;
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type, listener) {
      if (listener !== null) listeners.get(type)?.delete(listener);
    },
    fire(type, event) {
      for (const listener of listeners.get(type) ?? []) {
        // The fake hands each listener the plain object the test gave, standing in for an event.
        if (typeof listener === 'function') Reflect.apply(listener, undefined, [event]);
      }
    },
    count: (type) => listeners.get(type)?.size ?? 0,
  };
  return target;
}

function setup() {
  const scheduler = createManualScheduler({ wall: 0 });
  return { scheduler, scope: createScope(scheduler) };
}

describe('createScope', () => {
  it('runs its timers, frames, and listeners while alive', () => {
    const { scheduler, scope } = setup();
    const target = fakeTarget();
    const ran: string[] = [];
    scope.setTimeout(() => ran.push('timeout'), 10);
    scope.setInterval(() => ran.push('interval'), 10);
    scope.requestFrame(() => ran.push('frame'));
    scope.listen(target, 'keydown', (event: { key: string }) => ran.push(`key ${event.key}`));
    scheduler.advance(20);
    target.fire('keydown', { key: 'a' });
    expect(ran).toEqual(['timeout', 'interval', 'frame', 'interval', 'key a']);
  });

  it('cancels every timer, frame, listener, and owned cleanup on dispose', () => {
    const { scheduler, scope } = setup();
    const target = fakeTarget();
    const ran: string[] = [];
    scope.setTimeout(() => ran.push('timeout'), 10);
    scope.setInterval(() => ran.push('interval'), 10);
    scope.requestFrame(() => ran.push('frame'));
    scope.listen(target, 'pointerdown', () => ran.push('pointer'));
    scope.own(() => ran.push('sound stopped'));

    scope.dispose();
    scheduler.advance(100);
    target.fire('pointerdown', {});

    expect(ran).toEqual(['sound stopped']);
    expect(scheduler.pending()).toBe(0);
    expect(target.count('pointerdown')).toBe(0);
    expect(scope.disposed).toBe(true);
  });

  it('makes every call after dispose a safe no-op, and runs late cleanup at once', () => {
    const { scheduler, scope } = setup();
    const target = fakeTarget();
    scope.dispose();
    const ran: string[] = [];
    const cancels = [
      scope.setTimeout(() => ran.push('timeout'), 1),
      scope.setInterval(() => ran.push('interval'), 1),
      scope.requestFrame(() => ran.push('frame')),
      scope.listen(target, 'click', () => ran.push('click')),
    ];
    scope.own(() => ran.push('late cleanup'));
    scheduler.advance(50);
    target.fire('click', {});
    for (const cancel of cancels) cancel();
    scope.dispose();
    expect(ran).toEqual(['late cleanup']);
    expect(target.count('click')).toBe(0);
    expect(scheduler.pending()).toBe(0);
  });

  it('cancels one item early without touching the others', () => {
    const { scheduler, scope } = setup();
    const target = fakeTarget();
    const ran: string[] = [];
    const cancelTimeout = scope.setTimeout(() => ran.push('cancelled'), 10);
    scope.setTimeout(() => ran.push('kept'), 10);
    const stopListening = scope.listen(target, 'click', () => ran.push('click'));
    const stopSound = scope.own(() => ran.push('sound stopped early'));
    cancelTimeout();
    stopListening();
    stopSound();
    stopSound();
    scheduler.advance(10);
    target.fire('click', {});
    scope.dispose();
    expect(ran).toEqual(['sound stopped early', 'kept']);
  });

  it('forgets a timeout and a frame once they ran, so dispose does not cancel them again', () => {
    const { scheduler, scope } = setup();
    let cancelledAfterRun = 0;
    const counting = {
      ...scheduler,
      setTimeout: (callback: () => void, ms: number) => {
        const cancel = scheduler.setTimeout(callback, ms);
        return () => {
          cancelledAfterRun += 1;
          cancel();
        };
      },
    };
    const tracked = createScope(counting);
    tracked.setTimeout(() => undefined, 5);
    scheduler.advance(5);
    tracked.dispose();
    expect(cancelledAfterRun).toBe(0);
    scope.dispose();
  });

  it('passes listener options to both add and remove', () => {
    const { scope } = setup();
    const calls: string[] = [];
    const target: ListenerTarget = {
      addEventListener: (type, _listener, options) => calls.push(`add ${type} ${JSON.stringify(options)}`),
      removeEventListener: (type, _listener, options) => calls.push(`remove ${type} ${JSON.stringify(options)}`),
    };
    scope.listen(target, 'wheel', () => undefined, { passive: false, capture: true });
    scope.dispose();
    expect(calls).toEqual([
      'add wheel {"passive":false,"capture":true}',
      'remove wheel {"passive":false,"capture":true}',
    ]);
  });

  it('runs every cleanup even when one throws, then reports the failure', () => {
    const { scope } = setup();
    const ran: string[] = [];
    scope.own(() => ran.push('first'));
    scope.own(() => {
      throw new Error('broken sound');
    });
    scope.own(() => ran.push('third'));
    expect(() => scope.dispose()).toThrow('broken sound');
    expect(ran).toEqual(['first', 'third']);
    expect(() => scope.dispose()).not.toThrow();
  });
});
