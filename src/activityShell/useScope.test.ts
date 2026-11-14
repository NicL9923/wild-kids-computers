import { describe, expect, it } from 'vitest';
import { createManualScheduler } from '../core/activityKit/scheduler.ts';
import { createScopeLifetime } from './useScope.ts';

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
