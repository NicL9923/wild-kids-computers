import { describe, expect, it } from 'vitest';
import { numberHandle } from './index.ts';

describe('numberHandle', () => {
  it.each([
    [0, 'zero'],
    [7, 'seven'],
    [42, 'forty-two'],
    [100, 'one hundred'],
  ])('gives %i the clip that says %s', (value, speech) => {
    expect(numberHandle(value)).toMatchObject({ text: String(value), speech });
  });

  it.each([-1, 101, 2.5, Number.NaN])('rejects %s', (value) => {
    expect(() => numberHandle(value)).toThrow(/whole numbers 0 to 100/);
  });
});
