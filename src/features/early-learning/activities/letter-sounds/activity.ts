import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, type LetterSoundsLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<LetterSoundsLevel>({
  id: 'letter-sounds',
  area: 'early-learning',
  order: 100,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'speaker' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 5 },
    'band-6-8': { min: 3, max: 8 },
  },
  roundsPerSession: 5,
  generateLevel,
  spoken: [strings.instruction],
  load: () => import('./LetterSoundsActivity.tsx'),
});
