import { describe, expect, it } from 'vitest';
import { createSteppableClock } from './testClock.ts';

describe('steppable test clock', () => {
  it('follows the real clock and adds every step to both times', () => {
    const base = { wall: 1_000, mono: 50 };
    const clock = createSteppableClock({ now: () => base.wall, monotonic: () => base.mono });
    clock.advance(300);
    base.wall += 5;
    base.mono += 5;
    expect([clock.now(), clock.monotonic()]).toEqual([1_305, 355]);
  });

  it('refuses to move backward or by a non-number', () => {
    const clock = createSteppableClock({ now: () => 0, monotonic: () => 0 });
    for (const ms of [-1, Number.NaN]) expect(() => clock.advance(ms)).toThrow('only moves forward');
  });
});
