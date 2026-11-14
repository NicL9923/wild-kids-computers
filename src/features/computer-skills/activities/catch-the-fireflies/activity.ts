import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_FIREFLY_DIFFICULTY, type FirefliesLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<FirefliesLevel>({
  id: 'catch-the-fireflies',
  area: 'computer-skills',
  order: 40,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { art: 'catch-the-fireflies/firefly' },
  kind: 'rounds',
  inputs: ['click'],
  difficulty: {
    'band-3-5': { min: 1, max: 5 },
    'band-6-8': { min: 3, max: MAX_FIREFLY_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction],
  load: () => import('./CatchTheFirefliesActivity.tsx'),
});
