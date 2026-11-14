import { describe, expect, it } from 'vitest';
import { startView } from './startView.ts';

describe('start view', () => {
  it.each([
    ['loading', 3, false, 'loading'],
    ['unavailable', 0, false, 'unavailable'],
    ['needs-first-launch', 0, false, 'first-launch'],
    ['needs-first-launch', 2, false, 'first-launch'],
    ['needs-profile', 2, false, 'choose-profile'],
    ['ready', 2, false, 'choose-profile'],
    ['needs-profile', 1, false, 'home'],
    ['ready', 1, false, 'home'],
    // Going home would choose the one profile again, and fail again, without end.
    ['needs-profile', 1, true, 'choose-profile'],
  ] as const)('status %s with %i profiles, one not opened: %s, shows %s', (status, count, notOpened, view) => {
    expect(startView(status, count, notOpened)).toBe(view);
  });
});
