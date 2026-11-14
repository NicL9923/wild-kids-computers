import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_POD_DIFFICULTY, type PodsLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<PodsLevel>({
  id: 'pop-the-seed-pods',
  area: 'computer-skills',
  order: 30,
  bands: ['band-3-5'],
  goal: strings.goal,
  title: strings.title,
  icon: { art: 'pop-the-seed-pods/pod' },
  kind: 'rounds',
  inputs: ['click'],
  difficulty: { 'band-3-5': { min: 1, max: MAX_POD_DIFFICULTY } },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction],
  load: () => import('./PopTheSeedPodsActivity.tsx'),
});
