import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_DIFFICULTY, type RhymingPairsLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<RhymingPairsLevel>({
  id: 'rhyming-pairs',
  area: 'early-learning',
  order: 140,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'music-note' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 3 },
    'band-6-8': { min: 2, max: MAX_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction],
  load: () => import('./RhymingPairsActivity.tsx'),
});
