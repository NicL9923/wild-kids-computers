import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_DIFFICULTY, type AlphabetOrderLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<AlphabetOrderLevel>({
  id: 'alphabet-order',
  area: 'early-learning',
  order: 130,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'books' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 4 },
    'band-6-8': { min: 2, max: MAX_DIFFICULTY },
  },
  roundsPerSession: 5,
  generateLevel,
  spoken: [strings.whatComesNext, strings.putInOrder],
  load: () => import('./AlphabetOrderActivity.tsx'),
});
