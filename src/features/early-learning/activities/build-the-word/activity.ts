import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_DIFFICULTY, type BuildTheWordLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<BuildTheWordLevel>({
  id: 'build-the-word',
  area: 'early-learning',
  order: 150,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'pencil' },
  kind: 'rounds',
  inputs: ['click', 'drag', 'keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 4 },
    'band-6-8': { min: 3, max: MAX_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction],
  load: () => import('./BuildTheWordActivity.tsx'),
});
