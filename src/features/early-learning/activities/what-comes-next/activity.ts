import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_DIFFICULTY, type WhatComesNextLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<WhatComesNextLevel>({
  id: 'what-comes-next',
  area: 'early-learning',
  order: 310,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'caterpillar' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 4 },
    'band-6-8': { min: 3, max: MAX_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction],
  load: () => import('./WhatComesNextActivity.tsx'),
});
