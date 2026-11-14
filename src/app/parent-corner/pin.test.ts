import { describe, expect, it } from 'vitest';
import { pinProblem } from './pin.ts';

describe('new parent PIN', () => {
  it.each([
    ['123', '123', 'invalid'],
    ['123456789', '123456789', 'invalid'],
    ['12a4', '12a4', 'invalid'],
    ['', '', 'invalid'],
    ['1234', '1243', 'mismatch'],
    ['1234', '', 'mismatch'],
    ['1234', '1234', null],
    ['12345678', '12345678', null],
  ])('%s then %s is %s', (pin, repeat, problem) => {
    expect(pinProblem(pin, repeat)).toBe(problem);
  });
});
