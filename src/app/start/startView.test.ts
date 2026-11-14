import { describe, expect, it } from 'vitest';
import { startView } from './startView.ts';

describe('start view', () => {
  it.each([
    ['loading', 3, 'loading'],
    ['needs-first-launch', 0, 'first-launch'],
    ['needs-first-launch', 2, 'first-launch'],
    ['needs-profile', 2, 'choose-profile'],
    ['ready', 2, 'choose-profile'],
    ['needs-profile', 1, 'home'],
    ['ready', 1, 'home'],
  ] as const)('status %s with %i profiles shows %s', (status, count, view) => {
    expect(startView(status, count)).toBe(view);
  });
});
