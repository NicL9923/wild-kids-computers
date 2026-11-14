import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_DIFFICULTY, type FirstSoundLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<FirstSoundLevel>({
  id: 'first-sound',
  area: 'early-learning',
  order: 120,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'apple' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 5 },
    'band-6-8': { min: 3, max: MAX_DIFFICULTY },
  },
  roundsPerSession: 5,
  generateLevel,
  spoken: [strings.instruction],
  load: () => import('./FirstSoundActivity.tsx'),
});
