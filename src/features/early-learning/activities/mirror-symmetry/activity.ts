import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_DIFFICULTY, type MirrorLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<MirrorLevel>({
  id: 'mirror-symmetry',
  area: 'early-learning',
  order: 240,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'butterfly' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-6-8': { min: 1, max: 6 },
    'band-9-12': { min: 3, max: MAX_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction],
  load: () => import('./MirrorSymmetryActivity.tsx'),
});
