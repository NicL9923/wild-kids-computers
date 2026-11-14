import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_TIMES_DIFFICULTY, type TimesLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<TimesLevel>({
  id: 'times-tables',
  area: 'early-learning',
  order: 260,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'chocolate' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-6-8': { min: 1, max: 5 },
    'band-9-12': { min: 3, max: MAX_TIMES_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction, strings.rowsOf, strings.howMany, strings.whatIs],
  load: () => import('./TimesTablesActivity.tsx'),
});
