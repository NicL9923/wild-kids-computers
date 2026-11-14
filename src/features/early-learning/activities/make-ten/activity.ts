import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_TEN_DIFFICULTY, type TenLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<TenLevel>({
  id: 'make-ten',
  area: 'early-learning',
  order: 240,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'hand' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 3 },
    'band-6-8': { min: 2, max: MAX_TEN_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.ten, strings.five],
  load: () => import('./MakeTenActivity.tsx'),
});
