import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, type MoveResizeLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<MoveResizeLevel>({
  id: 'move-and-resize',
  area: 'toy-desktop',
  order: 20,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'window' },
  kind: 'rounds',
  inputs: ['drag', 'click', 'keyboard'],
  difficulty: {
    'band-6-8': { min: 1, max: 6 },
    'band-9-12': { min: 3, max: 10 },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction, strings.resize, strings.moveCloser, strings.resizeCloser],
  load: () => import('./MoveAndResizeActivity.tsx'),
});
