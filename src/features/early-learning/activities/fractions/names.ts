import type { SpokenHandle, StringHandle } from '../../../../core/strings/defineStrings.ts';
import { fractionKey, type Fraction } from './level.ts';
import { strings } from './strings.ts';

/** The spoken name of a fraction, such as "two thirds". Throws for a fraction with no name. */
export function fractionName(fraction: Fraction): SpokenHandle {
  const names: Readonly<Record<string, StringHandle>> = strings;
  const handle = names[`${String(fraction.numerator)}-${String(fraction.denominator)}`];
  if (handle?.kind !== 'spoken') throw new RangeError(`No name for the fraction ${fractionKey(fraction)}.`);
  return handle;
}
