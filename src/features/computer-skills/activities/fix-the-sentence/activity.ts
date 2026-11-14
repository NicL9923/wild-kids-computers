import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_FIX_DIFFICULTY, type FixLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<FixLevel>({
  id: 'fix-the-sentence',
  area: 'computer-skills',
  order: 180,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'notebook' },
  kind: 'rounds',
  inputs: ['keyboard', 'text-entry'],
  difficulty: {
    'band-6-8': { min: 1, max: 6 },
    'band-9-12': { min: 3, max: MAX_FIX_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction, strings.itSays, strings.showMark, strings.fixed],
  load: () => import('./FixTheSentenceActivity.tsx'),
});
