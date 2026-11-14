import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_ADD_DIFFICULTY, type AddLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<AddLevel>({
  id: 'add-and-subtract',
  area: 'early-learning',
  order: 230,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'green-apple' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 4 },
    'band-6-8': { min: 3, max: MAX_ADD_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.add, strings.subtract, strings.whatIs],
  load: () => import('./AddAndSubtractActivity.tsx'),
});
