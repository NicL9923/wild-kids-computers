import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_DIFFICULTY, type FindTheLetterLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<FindTheLetterLevel>({
  id: 'find-the-letter',
  area: 'early-learning',
  order: 110,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'eye' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 5 },
    'band-6-8': { min: 3, max: MAX_DIFFICULTY },
  },
  roundsPerSession: 5,
  generateLevel,
  spoken: [strings.instruction],
  load: () => import('./FindTheLetterActivity.tsx'),
});
