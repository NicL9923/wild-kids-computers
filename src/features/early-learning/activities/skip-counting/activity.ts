import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_SKIP_DIFFICULTY, type SkipLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<SkipLevel>({
  id: 'skip-counting',
  area: 'early-learning',
  order: 250,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'frog' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-6-8': { min: 1, max: 5 },
    'band-9-12': { min: 4, max: MAX_SKIP_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.whatNext, strings.byTwos, strings.byFives, strings.byTens, strings.whichMissing],
  load: () => import('./SkipCountingActivity.tsx'),
});
