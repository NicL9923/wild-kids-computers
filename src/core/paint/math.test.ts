/* oxlint-disable no-restricted-properties -- Math.sin and friends are the reference the engine's own math is checked against, with a stated tolerance. */
import { describe, expect, it } from 'vitest';
import {
  atan,
  atan2,
  clamp,
  cos,
  degreesToRadians,
  exp,
  HALF_PI,
  hypot,
  log,
  PI,
  pow,
  scaleByPowerOfTwo,
  sin,
  smoothstep,
  TAU,
} from './math.ts';

/** Evenly spaced samples from low to high, inclusive. */
function samples(low: number, high: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => low + ((high - low) * i) / (count - 1));
}

/** The largest error relative to max(1, |reference|): absolute near zero, relative for large values. */
function worstError(ours: (x: number) => number, reference: (x: number) => number, xs: readonly number[]): number {
  let worst = 0;
  for (const x of xs) {
    const expected = reference(x);
    const error = Math.abs(ours(x) - expected) / Math.max(1, Math.abs(expected));
    if (error > worst) worst = error;
  }
  return worst;
}

describe('engine math', () => {
  // Paint tools work within a few turns of zero. 1e-14 is a few units in the last place of a
  // double near 1, and a million times finer than one 8-bit color step.
  it.each([
    ['sin', sin, Math.sin],
    ['cos', cos, Math.cos],
  ] as const)('%s stays within 1e-14 of the reference from -20 to 20 radians', (_name, ours, reference) => {
    expect(worstError(ours, reference, samples(-20, 20, 40001))).toBeLessThan(1e-14);
  });

  it('sin and cos hit the exact values at their key angles', () => {
    expect(sin(0)).toBe(0);
    expect(cos(0)).toBe(1);
    expect(sin(HALF_PI)).toBe(1);
    expect(cos(PI)).toBe(-1);
    expect(sin(-HALF_PI)).toBe(-1);
    expect(Math.abs(sin(PI))).toBeLessThan(1e-15);
    expect(sin(PI / 6)).toBeCloseTo(0.5, 15);
    expect(cos(PI / 3)).toBeCloseTo(0.5, 15);
  });

  it('keeps sin squared plus cos squared at 1 across many turns', () => {
    for (const x of samples(-1000, 1000, 2001))
      expect(Math.abs(sin(x) * sin(x) + cos(x) * cos(x) - 1)).toBeLessThan(1e-14);
  });

  it('returns NaN for sin and cos of infinity and NaN', () => {
    for (const x of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN]) {
      expect(sin(x)).toBeNaN();
      expect(cos(x)).toBeNaN();
    }
  });

  it('atan stays within 1e-15 of the reference, including large inputs and infinity', () => {
    expect(worstError(atan, Math.atan, samples(-50, 50, 20001))).toBeLessThan(1e-15);
    expect(worstError(atan, Math.atan, [1e-300, 0.2679491924311227, 1, 1e8, -1e300])).toBeLessThan(1e-15);
    expect(atan(Number.POSITIVE_INFINITY)).toBe(HALF_PI);
    expect(atan(Number.NEGATIVE_INFINITY)).toBe(-HALF_PI);
    expect(atan(Number.NaN)).toBeNaN();
  });

  it('atan2 matches the reference in all four quadrants and on both axes', () => {
    let worst = 0;
    for (const angle of samples(-PI + 1e-9, PI, 3601)) {
      for (const radius of [1e-3, 1, 750]) {
        const y = radius * Math.sin(angle);
        const x = radius * Math.cos(angle);
        worst = Math.max(worst, Math.abs(atan2(y, x) - Math.atan2(y, x)));
      }
    }
    expect(worst).toBeLessThan(2e-15);
    expect([atan2(0, 0), atan2(1, 0), atan2(-1, 0), atan2(0, -1), atan2(-0.5, -0.5)]).toEqual([
      0,
      HALF_PI,
      -HALF_PI,
      PI,
      -3 * (PI / 4),
    ]);
    expect(atan2(Number.NaN, 1)).toBeNaN();
    expect(atan2(1, Number.NaN)).toBeNaN();
  });

  it('exp stays within 2e-15 relative error from -700 to 700', () => {
    expect(worstError(exp, Math.exp, samples(-30, 30, 20001))).toBeLessThan(2e-15);
    let worst = 0;
    for (const x of samples(-700, 700, 2001)) worst = Math.max(worst, Math.abs(exp(x) / Math.exp(x) - 1));
    expect(worst).toBeLessThan(2e-15);
    expect(exp(0)).toBe(1);
  });

  it('exp overflows to infinity and underflows to zero at the double limits', () => {
    expect(exp(710)).toBe(Number.POSITIVE_INFINITY);
    expect(exp(709.7)).toBeLessThan(Number.POSITIVE_INFINITY);
    expect(exp(-746)).toBe(0);
    expect(exp(-745)).toBeGreaterThan(0);
    expect(exp(Number.NaN)).toBeNaN();
  });

  it('log stays within 1e-15 of the reference from tiny to huge inputs', () => {
    const xs = [
      ...samples(1e-6, 10, 20001),
      1e-300,
      5e-324,
      1e-310,
      Math.SQRT1_2,
      Math.SQRT2,
      1.4142135623730954,
      1e300,
      123456789,
    ];
    expect(worstError(log, Math.log, xs)).toBeLessThan(1e-15);
    expect(log(1)).toBe(0);
    expect(log(Math.E)).toBeCloseTo(1, 15);
  });

  it('log follows the special cases: zero, negative, infinity, and NaN', () => {
    expect(log(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(log(-1)).toBeNaN();
    expect(log(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(log(Number.NaN)).toBeNaN();
  });

  it('pow multiplies exactly for integer exponents and uses exp and log otherwise', () => {
    expect([pow(2, 10), pow(2, -2), pow(-3, 3), pow(-3, 2), pow(7, 0), pow(0, 0)]).toEqual([1024, 0.25, -27, 9, 1, 1]);
    expect(pow(1.5, 2.5)).toBeCloseTo(Math.pow(1.5, 2.5), 14);
    expect(pow(2, 0.5)).toBeCloseTo(Math.SQRT2, 15);
    expect(pow(2, 2000)).toBe(Number.POSITIVE_INFINITY);
    let worst = 0;
    for (const base of samples(0.01, 4, 101)) {
      for (const power of samples(-3.3, 3.3, 61))
        worst = Math.max(worst, Math.abs(pow(base, power) / Math.pow(base, power) - 1));
    }
    expect(worst).toBeLessThan(1e-14);
  });

  it('pow returns NaN or the limit for the cases with no real answer', () => {
    expect(pow(-2, 0.5)).toBeNaN();
    expect(pow(Number.NaN, 2)).toBeNaN();
    expect(pow(2, Number.NaN)).toBeNaN();
    expect(pow(0, 2.5)).toBe(0);
    expect(pow(0, -2.5)).toBe(Number.POSITIVE_INFINITY);
  });

  it('scaleByPowerOfTwo is exact beyond the range one step of the exponent field covers', () => {
    expect(scaleByPowerOfTwo(1, 1023)).toBe(Math.pow(2, 1023));
    expect(scaleByPowerOfTwo(1, -1022)).toBe(Math.pow(2, -1022));
    expect(scaleByPowerOfTwo(0.5, 1024)).toBe(Math.pow(2, 1023));
    expect(scaleByPowerOfTwo(4, -1024)).toBe(Math.pow(2, -1022));
    expect(scaleByPowerOfTwo(3, 2)).toBe(12);
  });

  it('hypot, clamp, smoothstep, and degreesToRadians give their defined values', () => {
    expect(hypot(3, 4)).toBe(5);
    expect([clamp(-1, 0, 1), clamp(0.5, 0, 1), clamp(2, 0, 1)]).toEqual([0, 0.5, 1]);
    expect([smoothstep(0, 10, -1), smoothstep(0, 10, 5), smoothstep(0, 10, 11), smoothstep(0, 10, 2.5)]).toEqual([
      0, 0.5, 1, 0.15625,
    ]);
    expect(degreesToRadians(180)).toBe(PI);
    expect(TAU).toBe(2 * PI);
  });
});
