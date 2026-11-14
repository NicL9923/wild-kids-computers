import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import type { Puzzle } from '../../engine/puzzle.ts';
import { generateLevel, steps } from './level.ts';
import { strings } from './strings.ts';

/** Robot painter tier-2: one puzzle per step, each with a reference solution the tests run. */
export default defineActivity<Puzzle, never, Puzzle>({
  id: 'robot-patterns',
  area: 'robot-painter',
  order: 20,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { art: 'robot-painter/patterns' },
  kind: 'sequence',
  inputs: ['click', 'drag', 'keyboard'],
  steps,
  stepsDirectory: '../../puzzles/tier-2',
  generateLevel,
  spoken: [strings.instruction],
  load: () => import('./RobotPatternsActivity.tsx'),
});
