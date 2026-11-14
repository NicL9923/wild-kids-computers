import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_FRACTION_DIFFICULTY, type FractionLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<FractionLevel>({
  id: 'fractions',
  area: 'early-learning',
  order: 270,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'pizza' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-6-8': { min: 1, max: 5 },
    'band-9-12': { min: 3, max: MAX_FRACTION_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.findPicture, strings.whichFraction],
  load: () => import('./FractionsActivity.tsx'),
});
