import { describe, expect, it } from 'vitest';
import { handPoints } from './clockHands.ts';

describe('handPoints', () => {
  it.each([
    ['on the hour', { hour: 3, minute: 0 }, { short: { at: 3 }, long: { at: 12 } }],
    ['at twelve', { hour: 12, minute: 0 }, { short: { at: 12 }, long: { at: 12 } }],
    ['a quarter past', { hour: 3, minute: 15 }, { short: { between: [3, 4] }, long: { at: 3 } }],
    ['past eleven, round to twelve', { hour: 11, minute: 30 }, { short: { between: [11, 12] }, long: { at: 6 } }],
    ['past twelve, round to one', { hour: 12, minute: 45 }, { short: { between: [12, 1] }, long: { at: 9 } }],
    ['between minute marks', { hour: 7, minute: 7 }, { short: { between: [7, 8] }, long: { between: [1, 2] } }],
    ['just before the hour', { hour: 7, minute: 58 }, { short: { between: [7, 8] }, long: { between: [11, 12] } }],
  ])('points the hands %s', (_name, time, expected) => {
    expect(handPoints(time)).toEqual(expected);
  });
});
