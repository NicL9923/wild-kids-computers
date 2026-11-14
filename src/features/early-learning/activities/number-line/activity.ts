import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_LINE_DIFFICULTY, type LineLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<LineLevel>({
  id: 'number-line',
  area: 'early-learning',
  order: 220,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'ruler' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-6-8': { min: 1, max: 6 },
    'band-9-12': { min: 4, max: MAX_LINE_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.missing, strings.placeFor],
  load: () => import('./NumberLineActivity.tsx'),
});
