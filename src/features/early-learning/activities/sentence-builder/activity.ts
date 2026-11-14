import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_DIFFICULTY, type SentenceBuilderLevel } from './level.ts';
import { strings } from './strings.ts';

/** The tiles are written words, so this serves readers from band-6-8 up. */
export default defineActivity<SentenceBuilderLevel>({
  id: 'sentence-builder',
  area: 'early-learning',
  order: 180,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'notebook' },
  kind: 'rounds',
  inputs: ['click', 'drag', 'keyboard'],
  difficulty: {
    'band-6-8': { min: 1, max: 6 },
    'band-9-12': { min: 5, max: MAX_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction],
  load: () => import('./SentenceBuilderActivity.tsx'),
});
