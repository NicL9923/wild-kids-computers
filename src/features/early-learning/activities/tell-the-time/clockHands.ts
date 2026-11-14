import type { ClockTime } from './level.ts';

/** Where a hand points on the dial: right at a number, or between two numbers going clockwise. */
export type HandPoint = { readonly at: number } | { readonly between: readonly [number, number] };

/** The dial number at `place` twelfths of a turn from twelve: 0 and 12 are both 12. */
const dialNumber = (place: number) => (place % 12 === 0 ? 12 : place % 12);

function pointAt(twelfths: number): HandPoint {
  const whole = Math.floor(twelfths);
  return whole === twelfths ? { at: dialNumber(whole) } : { between: [dialNumber(whole), dialNumber(whole + 1)] };
}

/**
 * Where the short and long hands point, the way a person would say it without reading the time.
 * The short hand moves on between the hours, so at 3:15 it is between 3 and 4.
 */
export function handPoints(time: ClockTime): { short: HandPoint; long: HandPoint } {
  return { short: pointAt((time.hour % 12) + time.minute / 60), long: pointAt(time.minute / 5) };
}
