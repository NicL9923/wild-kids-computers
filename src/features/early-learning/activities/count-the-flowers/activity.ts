import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_FLOWER_DIFFICULTY, type FlowersLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<FlowersLevel>({
  id: 'count-the-flowers',
  area: 'early-learning',
  order: 10,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'sunflower' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 5 },
    'band-6-8': { min: 3, max: MAX_FLOWER_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction],
  load: () => import('./CountTheFlowersActivity.tsx'),
});
