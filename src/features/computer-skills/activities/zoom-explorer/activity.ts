import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_ZOOM_DIFFICULTY, type ZoomLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<ZoomLevel>({
  id: 'zoom-explorer',
  area: 'computer-skills',
  order: 90,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'magnifying-glass' },
  kind: 'rounds',
  inputs: ['zoom', 'scroll', 'click', 'keyboard'],
  difficulty: {
    'band-6-8': { min: 1, max: 6 },
    'band-9-12': { min: 3, max: MAX_ZOOM_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction, strings.findTiny, strings.tooSmall, strings.zoomOut],
  load: () => import('./ZoomExplorerActivity.tsx'),
});
