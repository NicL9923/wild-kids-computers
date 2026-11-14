import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, type FixItLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<FixItLevel>({
  id: 'fix-it',
  area: 'toy-desktop',
  order: 130,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'wrench' },
  kind: 'rounds',
  inputs: ['click', 'drag', 'keyboard'],
  difficulty: {
    'band-6-8': { min: 1, max: 6 },
    'band-9-12': { min: 3, max: 8 },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction, strings.soundOff, strings.minimized, strings.behind, strings.offSide],
  load: () => import('./FixItActivity.tsx'),
});
