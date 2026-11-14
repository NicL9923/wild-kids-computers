import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_DIFFICULTY, type DaysAndMonthsLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<DaysAndMonthsLevel>({
  id: 'days-and-months',
  area: 'early-learning',
  order: 260,
  bands: ['band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'calendar' },
  kind: 'rounds',
  inputs: ['click', 'drag', 'keyboard'],
  difficulty: { 'band-6-8': { min: 1, max: MAX_DIFFICULTY } },
  roundsPerSession: 5,
  generateLevel,
  spoken: [
    strings.dayAfter,
    strings.dayBefore,
    strings.monthAfter,
    strings.monthBefore,
    strings.orderDays,
    strings.orderMonths,
  ],
  load: () => import('./DaysAndMonthsActivity.tsx'),
});
