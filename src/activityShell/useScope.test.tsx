// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createManualScheduler } from '../core/activityKit/scheduler.ts';
import { createScope } from '../core/activityKit/scope.ts';
import { createScopeLifetime, useChildScope } from './useScope.ts';

describe('createScopeLifetime', () => {
  it('cancels everything on close, and opens a fresh scope after, as on a second mount', () => {
    const scheduler = createManualScheduler({ wall: 0 });
    const lifetime = createScopeLifetime(scheduler);
    const ran: string[] = [];
    lifetime.scope.setTimeout(() => ran.push('first'), 10);
    lifetime.close();
    expect(lifetime.scope.disposed).toBe(true);
    lifetime.open();
    expect(lifetime.scope.disposed).toBe(false);
    lifetime.scope.setTimeout(() => ran.push('second'), 10);
    lifetime.scope.requestFrame(() => ran.push('frame'));
    const stop = lifetime.scope.setInterval(() => ran.push('tick'), 7);
    lifetime.scope.own(() => ran.push('cleanup'));
    lifetime.scope.listen(new EventTarget(), 'x', () => undefined);
    scheduler.advance(17);
    stop();
    scheduler.advance(20);
    expect(ran).toEqual(['tick', 'second', 'tick', 'frame']);
    lifetime.close();
    expect(ran.at(-1)).toBe('cleanup');
  });

  it('keeps the open scope when opened twice', () => {
    const scheduler = createManualScheduler({ wall: 0 });
    const lifetime = createScopeLifetime(scheduler);
    const ran: string[] = [];
    lifetime.scope.setTimeout(() => ran.push('kept'), 10);
    lifetime.open();
    scheduler.advance(10);
    expect(ran).toEqual(['kept']);
  });
});

/** A child scope under a parent scope on a manual clock, as an attempt sits in a round. */
function setup() {
  const clock = createManualScheduler({ wall: 0 });
  const parent = createScope(clock);
  const hook = renderHook(() => useChildScope({ scope: parent, clock }));
  return { clock, parent, hook, child: hook.result.current };
}

describe('useChildScope', () => {
  it('runs its timers on the parent clock, and cancels only its own when it unmounts', () => {
    const { clock, parent, hook, child } = setup();
    const ran: string[] = [];
    child.setTimeout(() => ran.push('child, early'), 10);
    child.setTimeout(() => ran.push('child, late'), 30);
    parent.setTimeout(() => ran.push('parent'), 30);
    clock.advance(10);
    hook.unmount();
    clock.advance(30);
    expect(ran).toEqual(['child, early', 'parent']);
  });

  it('stops with the parent, as when the child leaves the activity', () => {
    const { clock, parent, child } = setup();
    const ran: string[] = [];
    child.setTimeout(() => ran.push('child'), 10);
    child.requestFrame(() => ran.push('frame'));
    parent.dispose();
    clock.advance(30);
    expect(ran).toEqual([]);
  });
});
