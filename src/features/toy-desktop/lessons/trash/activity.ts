import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, type TrashLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<TrashLevel>({
  id: 'trash',
  area: 'toy-desktop',
  order: 60,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'trash-can' },
  kind: 'rounds',
  inputs: ['click', 'drag', 'keyboard'],
  difficulty: {
    'band-6-8': { min: 1, max: 5 },
    'band-9-12': { min: 3, max: 8 },
  },
  roundsPerSession: 3,
  generateLevel,
  spoken: [
    strings.instruction,
    strings.deleteFox,
    strings.deleteSunflower,
    strings.deleteBoat,
    strings.deleteRainbow,
    strings.deleteButterfly,
    strings.deleteTractor,
    strings.openTrash,
    strings.restore,
  ],
  load: () => import('./TrashActivity.tsx'),
});
