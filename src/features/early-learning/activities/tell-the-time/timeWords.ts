import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { numberHandle } from '../../../../core/strings/shared/index.ts';
import { wrapHour, type ClockTime } from './level.ts';
import { strings } from './strings.ts';

/**
 * How a person says a time out loud, composed from clips: "three o'clock", "half past three",
 * "quarter past three", "quarter to four", "three oh five", and "three twenty".
 */
export function sayTime(time: ClockTime): SpokenHandle[] {
  const hour = numberHandle(time.hour);
  if (time.minute === 0) return [hour, strings.oclock];
  if (time.minute === 30) return [strings.halfPast, hour];
  if (time.minute === 15) return [strings.quarterPast, hour];
  if (time.minute === 45) return [strings.quarterTo, numberHandle(wrapHour(time.hour + 1))];
  if (time.minute < 10) return [hour, strings.oh, numberHandle(time.minute)];
  return [hour, numberHandle(time.minute)];
}
