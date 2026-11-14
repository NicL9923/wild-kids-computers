import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_PICNIC_DIFFICULTY, type PicnicLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<PicnicLevel>({
  id: 'pack-the-picnic',
  area: 'computer-skills',
  order: 50,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'basket' },
  kind: 'rounds',
  inputs: ['drag', 'keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 5 },
    'band-6-8': { min: 3, max: MAX_PICNIC_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction, strings.spots],
  load: () => import('./PackThePicnicActivity.tsx'),
});
