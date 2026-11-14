import { describe, expect, it } from 'vitest';
import type { ProgressDocument } from '../../core/storage/schemas.ts';
import { formatPracticeDay, practicedSkills } from './skills.ts';

const goals = [
  { id: 'pop-the-seed-pods', area: 'computer-skills', order: 3, goal: 'Click a large target that stays still.' },
  { id: 'wake-the-meadow', area: 'computer-skills', order: 1, goal: 'Move the pointer.' },
  { id: 'count-the-flowers', area: 'early-learning', order: 1, goal: 'Count up to ten things.' },
];

function progressOf(activities: Record<string, readonly string[]>): ProgressDocument {
  return {
    version: 1,
    activities: Object.fromEntries(
      Object.entries(activities).map(([id, days]) => [id, { recentRounds: [], daysPracticed: [...days] }]),
    ),
  };
}

describe('skills practiced', () => {
  it('groups by area in a fixed order and sorts each area by activity order', () => {
    const progress = progressOf({
      'count-the-flowers': ['2026-11-02'],
      'pop-the-seed-pods': ['2026-11-01', '2026-11-03'],
      'wake-the-meadow': ['2026-10-30'],
    });
    expect(practicedSkills(progress, goals)).toEqual([
      {
        area: 'computer-skills',
        skills: [
          { activityId: 'wake-the-meadow', goal: 'Move the pointer.', firstDay: '2026-10-30', lastDay: '2026-10-30' },
          {
            activityId: 'pop-the-seed-pods',
            goal: 'Click a large target that stays still.',
            firstDay: '2026-11-01',
            lastDay: '2026-11-03',
          },
        ],
      },
      {
        area: 'early-learning',
        skills: [
          {
            activityId: 'count-the-flowers',
            goal: 'Count up to ten things.',
            firstDay: '2026-11-02',
            lastDay: '2026-11-02',
          },
        ],
      },
    ]);
  });

  it('leaves out an activity with no practice day', () => {
    expect(practicedSkills(progressOf({ 'pop-the-seed-pods': [] }), goals)).toEqual([]);
  });

  it('keeps an activity this build does not define, under other, without a goal', () => {
    const unknownArea = [{ id: 'mystery', area: 'space-station', order: 1, goal: 'Float.' }];
    expect(practicedSkills(progressOf({ retired: ['2026-01-05'], mystery: ['2026-01-06'] }), unknownArea)).toEqual([
      {
        area: 'other',
        skills: [
          { activityId: 'mystery', goal: 'Float.', firstDay: '2026-01-06', lastDay: '2026-01-06' },
          { activityId: 'retired', goal: null, firstDay: '2026-01-05', lastDay: '2026-01-05' },
        ],
      },
    ]);
  });
});

describe('practice day', () => {
  it('reads as the same local calendar day in every timezone', () => {
    expect(formatPracticeDay('2026-11-14', 'en-US')).toBe('November 14, 2026');
    expect(formatPracticeDay('2026-01-01', 'en-US')).toBe('January 1, 2026');
  });
});
