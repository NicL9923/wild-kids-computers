import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_DIFFICULTY, type ShapeSorterLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<ShapeSorterLevel>({
  id: 'shape-sorter',
  area: 'early-learning',
  order: 210,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'puzzle-piece' },
  kind: 'rounds',
  inputs: ['click', 'drag', 'keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 5 },
    'band-6-8': { min: 4, max: MAX_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction],
  load: () => import('./ShapeSorterActivity.tsx'),
});
