import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_DIFFICULTY, type MazeLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<MazeLevel>({
  id: 'mazes',
  area: 'early-learning',
  order: 360,
  bands: ['band-3-5', 'band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'footprints' },
  kind: 'rounds',
  inputs: ['pointer-move', 'click', 'keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 4 },
    'band-6-8': { min: 3, max: 8 },
    'band-9-12': { min: 6, max: MAX_DIFFICULTY },
  },
  roundsPerSession: 3,
  generateLevel,
  spoken: [strings.instruction, strings.thisWay],
  load: () => import('./MazesActivity.tsx'),
});
