import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_DIFFICULTY, type MissingLetterLevel } from './level.ts';
import { strings } from './strings.ts';

/** Spelling a word needs some reading, so this serves band-6-8; first-sound covers the youngest. */
export default defineActivity<MissingLetterLevel>({
  id: 'missing-letter',
  area: 'early-learning',
  order: 170,
  bands: ['band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'puzzle-piece' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-6-8': { min: 1, max: MAX_DIFFICULTY },
  },
  roundsPerSession: 5,
  generateLevel,
  spoken: [strings.instruction],
  load: () => import('./MissingLetterActivity.tsx'),
});
