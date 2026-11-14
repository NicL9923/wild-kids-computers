import { describe, expect, it } from 'vitest';
import { toActivityGoal } from './activityGoals.ts';

describe('activity goals for the parent corner', () => {
  it('reads the id, area, order, and goal text of a definition', () => {
    const definition = {
      id: 'pop-the-seed-pods',
      area: 'computer-skills',
      order: 3,
      goal: { text: 'Click a target.' },
    };
    expect(toActivityGoal(definition)).toEqual({
      id: 'pop-the-seed-pods',
      area: 'computer-skills',
      order: 3,
      goal: 'Click a target.',
    });
  });

  it.each([
    ['null', null],
    ['a string', 'pop-the-seed-pods'],
    ['a missing id', { area: 'computer-skills', goal: { text: 'x' } }],
    ['a goal without text', { id: 'a', area: 'computer-skills', goal: {} }],
    ['a goal that is a plain string', { id: 'a', area: 'computer-skills', goal: 'x' }],
  ])('skips %s', (_label, definition) => {
    expect(toActivityGoal(definition)).toBeNull();
  });
});
