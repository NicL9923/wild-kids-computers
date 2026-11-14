import { describe, expect, it } from 'vitest';
import { createManualScheduler, FRAME_MS } from '../core/activityKit/scheduler.ts';
import { createSwitchableScheduler, exposeKitTime, KIT_TIME_GLOBAL, type KitTimeHook } from './kitTime.ts';

/** A base scheduler standing in for the page's timers, so the test controls both clocks. */
function setup() {
  const base = createManualScheduler({ wall: 1000, monotonic: 50 });
  return { base, scheduler: createSwitchableScheduler(base) };
}

function isHook(value: unknown): value is KitTimeHook {
  return typeof value === 'object' && value !== null && 'pin' in value && 'advance' in value && 'stepFrames' in value;
}

function hookOn(target: object): KitTimeHook {
  const hook: unknown = Reflect.get(target, KIT_TIME_GLOBAL);
  if (!isHook(hook)) throw new Error('No hook');
  return hook;
}

describe('createSwitchableScheduler', () => {
  it('runs on the base scheduler until pinned', () => {
    const { base, scheduler } = setup();
    const ran: string[] = [];
    scheduler.setTimeout(() => ran.push('real'), 10);
    base.advance(10);
    expect(ran).toEqual(['real']);
    expect(scheduler.now()).toBe(1010);
    expect(scheduler.manual).toBeNull();
  });

  it('after a pin, keeps time still until stepped, while timers set before keep real timing', () => {
    const { base, scheduler } = setup();
    const ran: string[] = [];
    scheduler.setTimeout(() => ran.push('before pin'), 10);
    const manual = scheduler.pin(5000);
    scheduler.setTimeout(() => ran.push('after pin'), 10);
    scheduler.requestFrame(() => ran.push('frame'));
    scheduler.setInterval(() => ran.push('tick'), 100);
    base.advance(20);
    expect(ran).toEqual(['before pin']);
    expect(scheduler.now()).toBe(5000);
    // The pinned monotonic clock carries on from the base, so it never jumps back.
    expect(scheduler.monotonic()).toBe(50);
    manual.advance(10);
    expect(ran).toEqual(['before pin', 'after pin']);
    manual.advance(90);
    expect(ran).toEqual(['before pin', 'after pin', 'frame', 'tick']);
  });
});

describe('exposeKitTime', () => {
  it('lets a test pin, advance, and step frames, returning the monotonic time', () => {
    const { scheduler } = setup();
    const target = {};
    exposeKitTime(scheduler, target);
    const hook = hookOn(target);
    expect(hook.pin(2000)).toBe(50);
    expect(hook.advance(100)).toBe(150);
    expect(hook.stepFrames(1)).toBeCloseTo(FRAME_MS * 10, 6);
    expect(scheduler.now()).toBeCloseTo(2000 + FRAME_MS * 10 - 50, 6);
  });

  it('refuses to step time that is not pinned', () => {
    const target = {};
    exposeKitTime(setup().scheduler, target);
    expect(() => hookOn(target).advance(10)).toThrow(/Pin kit time first/);
    expect(() => hookOn(target).stepFrames(1)).toThrow(/Pin kit time first/);
  });
});
