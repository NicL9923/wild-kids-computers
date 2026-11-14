import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_DIFFICULTY, type SightWordsLevel } from './level.ts';
import { strings } from './strings.ts';

/** Reading a written word is the goal, so this serves readers from band-6-8 and not the youngest. */
export default defineActivity<SightWordsLevel>({
  id: 'sight-words',
  area: 'early-learning',
  order: 160,
  bands: ['band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'book' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-6-8': { min: 1, max: MAX_DIFFICULTY },
  },
  roundsPerSession: 6,
  generateLevel,
  spoken: [strings.instruction],
  load: () => import('./SightWordsActivity.tsx'),
});
