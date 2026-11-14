import { afterEach, describe, expect, it, vi } from 'vitest';
import { createManualScheduler, FRAME_MS, systemScheduler } from './scheduler.ts';

describe('createManualScheduler', () => {
  it('pins wall and monotonic time and moves them only when advanced', () => {
    const scheduler = createManualScheduler({ wall: 1_700_000_000_000, monotonic: 500 });
    expect([scheduler.now(), scheduler.monotonic()]).toEqual([1_700_000_000_000, 500]);
    scheduler.advance(250);
    expect([scheduler.now(), scheduler.monotonic()]).toEqual([1_700_000_000_250, 750]);
  });

  it('runs a timeout at its due time, not before', () => {
    const scheduler = createManualScheduler({ wall: 0 });
    const ran: number[] = [];
    scheduler.setTimeout(() => ran.push(scheduler.monotonic()), 100);
    scheduler.advance(99);
    expect(ran).toEqual([]);
    scheduler.advance(1);
    expect(ran).toEqual([100]);
    scheduler.advance(1000);
    expect(ran).toEqual([100]);
  });

  it('runs a zero delay timeout on the next advance', () => {
    const scheduler = createManualScheduler({ wall: 0 });
    const ran: string[] = [];
    scheduler.setTimeout(() => ran.push('now'), 0);
    scheduler.advance(0);
    expect(ran).toEqual(['now']);
  });

  it('runs timers in due order, and equal times in the order they were set', () => {
    const scheduler = createManualScheduler({ wall: 0 });
    const ran: string[] = [];
    scheduler.setTimeout(() => ran.push('b'), 50);
    scheduler.setTimeout(() => ran.push('a'), 20);
    scheduler.setTimeout(() => ran.push('c'), 50);
    scheduler.advance(60);
    expect(ran).toEqual(['a', 'b', 'c']);
  });

  it('repeats an interval until cancelled', () => {
    const scheduler = createManualScheduler({ wall: 0 });
    const ran: number[] = [];
    const cancel = scheduler.setInterval(() => ran.push(scheduler.monotonic()), 30);
    scheduler.advance(95);
    expect(ran).toEqual([30, 60, 90]);
    cancel();
    cancel();
    scheduler.advance(100);
    expect(ran).toEqual([30, 60, 90]);
  });

  it('treats a zero interval as one millisecond so it cannot spin forever', () => {
    const scheduler = createManualScheduler({ wall: 0 });
    let count = 0;
    scheduler.setInterval(() => {
      count += 1;
    }, 0);
    scheduler.advance(5);
    expect(count).toBe(5);
  });

  it('cancelling twice leaves other timers alone', () => {
    const scheduler = createManualScheduler({ wall: 0 });
    const ran: string[] = [];
    const cancel = scheduler.setTimeout(() => ran.push('cancelled'), 10);
    scheduler.setTimeout(() => ran.push('kept'), 10);
    cancel();
    cancel();
    scheduler.advance(10);
    expect(ran).toEqual(['kept']);
  });

  it('counts waiting timers and frames together', () => {
    const scheduler = createManualScheduler({ wall: 0 });
    scheduler.setTimeout(() => undefined, 10);
    scheduler.requestFrame(() => undefined);
    scheduler.requestFrame(() => undefined);
    expect(scheduler.pending()).toBe(3);
    scheduler.stepFrames(1);
    expect(scheduler.pending()).toBe(0);
  });

  it('runs every frame callback requested, even the same function twice, between timers', () => {
    const scheduler = createManualScheduler({ wall: 0 });
    const ran: string[] = [];
    const frame = () => ran.push('frame');
    scheduler.setTimeout(() => undefined, 100);
    scheduler.requestFrame(frame);
    scheduler.setTimeout(() => undefined, 100);
    scheduler.requestFrame(frame);
    scheduler.stepFrames(1);
    expect(ran).toEqual(['frame', 'frame']);
  });

  it('runs frames when no timer is waiting', () => {
    const scheduler = createManualScheduler({ wall: 0 });
    let frames = 0;
    const loop = () => {
      frames += 1;
      scheduler.requestFrame(loop);
    };
    scheduler.requestFrame(loop);
    // Sixty frames end a hair after one second, because a frame is 1000 / 60 ms.
    scheduler.advance(1001);
    expect(frames).toBe(60);
  });

  it('cancels a timeout before it runs', () => {
    const scheduler = createManualScheduler({ wall: 0 });
    const ran: string[] = [];
    const cancel = scheduler.setTimeout(() => ran.push('x'), 10);
    expect(scheduler.pending()).toBe(1);
    cancel();
    expect(scheduler.pending()).toBe(0);
    scheduler.advance(20);
    expect(ran).toEqual([]);
  });

  it('runs frame callbacks on frame boundaries with the frame time', () => {
    const scheduler = createManualScheduler({ wall: 0, monotonic: 1000 });
    const times: number[] = [];
    scheduler.requestFrame((time) => times.push(time));
    scheduler.advance(FRAME_MS - 1);
    expect(times).toEqual([]);
    scheduler.advance(1);
    expect(times).toEqual([1000 + FRAME_MS]);
  });

  it('runs a frame requested inside a frame on the next frame, as a browser does', () => {
    const scheduler = createManualScheduler({ wall: 0 });
    const frames: number[] = [];
    const loop = (time: number) => {
      frames.push(time);
      if (frames.length < 3) scheduler.requestFrame(loop);
    };
    scheduler.requestFrame(loop);
    scheduler.stepFrames(1);
    expect(frames).toHaveLength(1);
    scheduler.stepFrames(5);
    expect(frames).toEqual([FRAME_MS, 2 * FRAME_MS, 3 * FRAME_MS]);
  });

  it('steps whole frames from a time between frames', () => {
    const scheduler = createManualScheduler({ wall: 0 });
    scheduler.advance(5);
    let ran = 0;
    scheduler.requestFrame(() => {
      ran += 1;
    });
    scheduler.stepFrames(1);
    expect(ran).toBe(1);
    expect(scheduler.monotonic()).toBe(FRAME_MS);
    scheduler.stepFrames(0);
    expect(scheduler.monotonic()).toBe(FRAME_MS);
  });

  it('cancels a frame callback', () => {
    const scheduler = createManualScheduler({ wall: 0 });
    let ran = false;
    const cancel = scheduler.requestFrame(() => {
      ran = true;
    });
    cancel();
    scheduler.stepFrames(2);
    expect(ran).toBe(false);
  });

  it('runs a timer that falls before a frame first, and a timer on the frame time before the frame', () => {
    const scheduler = createManualScheduler({ wall: 0 });
    const order: string[] = [];
    scheduler.requestFrame(() => order.push('frame'));
    scheduler.setTimeout(() => order.push('on-frame'), FRAME_MS);
    scheduler.setTimeout(() => order.push('early'), 1);
    scheduler.stepFrames(1);
    expect(order).toEqual(['early', 'on-frame', 'frame']);
  });

  it('runs a timeout that a timer sets during the same advance when it falls due', () => {
    const scheduler = createManualScheduler({ wall: 0 });
    const ran: number[] = [];
    scheduler.setTimeout(() => {
      scheduler.setTimeout(() => ran.push(scheduler.monotonic()), 10);
    }, 10);
    scheduler.advance(25);
    expect(ran).toEqual([20]);
  });

  it.each([
    ['setTimeout', (s: ReturnType<typeof createManualScheduler>) => s.setTimeout(() => undefined, -1)],
    ['setInterval', (s: ReturnType<typeof createManualScheduler>) => s.setInterval(() => undefined, Number.NaN)],
    ['advance', (s: ReturnType<typeof createManualScheduler>) => s.advance(-5)],
  ])('rejects a negative or missing delay for %s', (name, call) => {
    const scheduler = createManualScheduler({ wall: 0 });
    expect(() => call(scheduler)).toThrow(new RegExp(`${name} needs a delay of 0 ms or more`));
  });

  it.each([-1, 1.5])('rejects %s frames', (count) => {
    expect(() => createManualScheduler({ wall: 0 }).stepFrames(count)).toThrow(/whole number of frames/);
  });
});

describe('systemScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules on the page timers and cancels them', () => {
    vi.useFakeTimers({ now: 5000, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const scheduler = systemScheduler();
    const ran: string[] = [];
    scheduler.setTimeout(() => ran.push('timeout'), 10);
    const cancelled = scheduler.setTimeout(() => ran.push('cancelled'), 10);
    cancelled();
    const stop = scheduler.setInterval(() => ran.push('tick'), 4);
    vi.advanceTimersByTime(10);
    stop();
    vi.advanceTimersByTime(10);
    expect(ran).toEqual(['tick', 'tick', 'timeout']);
    expect(scheduler.now()).toBe(5020);
  });

  it('asks the page for animation frames and cancels them', () => {
    const requested: ((time: number) => void)[] = [];
    const cancelled: number[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => requested.push(callback));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => cancelled.push(id));
    const scheduler = systemScheduler();
    const times: number[] = [];
    const cancel = scheduler.requestFrame((time) => times.push(time));
    requested[0]?.(16);
    cancel();
    expect(times).toEqual([16]);
    expect(cancelled).toEqual([1]);
  });

  it('reads the monotonic clock of the page', () => {
    const first = systemScheduler().monotonic();
    expect(typeof first).toBe('number');
    expect(systemScheduler().monotonic()).toBeGreaterThanOrEqual(first);
  });

  it('rejects a negative delay', () => {
    expect(() => systemScheduler().setTimeout(() => undefined, -1)).toThrow(/setTimeout needs a delay/);
    expect(() => systemScheduler().setInterval(() => undefined, -1)).toThrow(/setInterval needs a delay/);
  });
});
