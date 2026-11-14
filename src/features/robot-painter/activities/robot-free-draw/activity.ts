import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import type { FreeMode } from '../../engine/freeMode.ts';
import { generateLevel } from './level.ts';
import { strings } from './strings.ts';

/** Robot painter free mode: any program, no goal, and the drawing can go to the paint studio. */
export default defineActivity<FreeMode>({
  id: 'robot-free-draw',
  area: 'robot-painter',
  // After the three tiers.
  order: 100,
  bands: ['band-3-5', 'band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { art: 'robot-painter/free-draw' },
  kind: 'free',
  inputs: ['click', 'drag', 'keyboard'],
  generateLevel,
  spoken: [strings.instruction],
  load: () => import('./RobotFreeDrawActivity.tsx'),
});
