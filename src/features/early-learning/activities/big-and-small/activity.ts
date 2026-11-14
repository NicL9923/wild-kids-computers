import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_DIFFICULTY, type BigAndSmallLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<BigAndSmallLevel>({
  id: 'big-and-small',
  area: 'early-learning',
  order: 220,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'elephant' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 5 },
    'band-6-8': { min: 3, max: MAX_DIFFICULTY },
  },
  roundsPerSession: 5,
  generateLevel,
  spoken: [strings.bigger, strings.smaller, strings.biggest, strings.smallest, strings.smallToBig, strings.bigToSmall],
  load: () => import('./BigAndSmallActivity.tsx'),
});
