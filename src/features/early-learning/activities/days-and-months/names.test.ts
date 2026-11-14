import { describe, expect, it } from 'vitest';
import { days, months } from '../../../../core/strings/shared/index.ts';
import { nameOf } from './names.ts';

describe('nameOf', () => {
  it('counts from Monday and January, as the level does', () => {
    expect(nameOf('days', 0)).toBe(days.monday);
    expect(nameOf('days', 6)).toBe(days.sunday);
    expect(nameOf('months', 0)).toBe(months.january);
    expect(nameOf('months', 11)).toBe(months.december);
  });

  it('rejects an index past the end, naming what is missing', () => {
    expect(() => nameOf('days', 7)).toThrow('No day 7.');
    expect(() => nameOf('months', 12)).toThrow('No month 12.');
  });
});
