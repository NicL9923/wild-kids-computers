import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { days, months } from '../../../../core/strings/shared/index.ts';
import type { Cycle } from './level.ts';

const DAYS = [days.monday, days.tuesday, days.wednesday, days.thursday, days.friday, days.saturday, days.sunday];
const MONTHS = [
  months.january,
  months.february,
  months.march,
  months.april,
  months.may,
  months.june,
  months.july,
  months.august,
  months.september,
  months.october,
  months.november,
  months.december,
];

/** The shared clip for a day or month by its index, Monday and January first. */
export function nameOf(cycle: Cycle, index: number): SpokenHandle {
  const handle = (cycle === 'days' ? DAYS : MONTHS)[index];
  if (handle === undefined) throw new RangeError(`No ${cycle === 'days' ? 'day' : 'month'} ${String(index)}.`);
  return handle;
}
