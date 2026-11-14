import { describe, expect, it } from 'vitest';
import { BANDS, DEFAULT_BAND, isBand } from './bands.ts';

describe('isBand', () => {
  it.each(BANDS)('accepts %s', (band) => {
    expect(isBand(band)).toBe(true);
  });

  it.each([
    ['a near miss', 'band-3-6'],
    ['a different case', 'BAND-3-5'],
    ['an empty string', ''],
    ['null', null],
    ['undefined', undefined],
    ['a number', 3],
    ['an object', { band: 'band-3-5' }],
  ])('rejects %s', (_label, value) => {
    expect(isBand(value)).toBe(false);
  });
});

describe('DEFAULT_BAND', () => {
  // The spec says the youngest band wins when requirements compete, so a screen shown
  // before a profile loads must use the youngest band's targets.
  it('is the youngest band', () => {
    expect(DEFAULT_BAND).toBe('band-3-5');
  });
});
