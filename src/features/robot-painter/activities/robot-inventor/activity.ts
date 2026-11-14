import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import type { Puzzle } from '../../engine/puzzle.ts';
import { generateLevel, steps } from './level.ts';
import { strings } from './strings.ts';

/** Robot painter tier-3: one puzzle per step, each with a reference solution the tests run. */
export default defineActivity<Puzzle, never, Puzzle>({
  id: 'robot-inventor',
  area: 'robot-painter',
  order: 30,
  bands: ['band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { art: 'robot-painter/inventor' },
  kind: 'sequence',
  inputs: ['click', 'drag', 'keyboard'],
  steps,
  stepsDirectory: '../../puzzles/tier-3',
  generateLevel,
  spoken: [strings.instruction],
  load: () => import('./RobotInventorActivity.tsx'),
});
