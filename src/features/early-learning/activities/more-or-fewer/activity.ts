import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_MORE_DIFFICULTY, type MoreLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<MoreLevel>({
  id: 'more-or-fewer',
  area: 'early-learning',
  order: 210,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'cherries' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 5 },
    'band-6-8': { min: 3, max: MAX_MORE_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.more, strings.fewer, strings.most, strings.fewest],
  load: () => import('./MoreOrFewerActivity.tsx'),
});
