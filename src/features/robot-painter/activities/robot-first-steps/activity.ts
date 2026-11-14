import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import type { Puzzle } from '../../engine/puzzle.ts';
import { generateLevel, steps } from './level.ts';
import { strings } from './strings.ts';

/** Robot painter tier-1: one puzzle per step, each with a reference solution the tests run. */
export default defineActivity<Puzzle, never, Puzzle>({
  id: 'robot-first-steps',
  area: 'robot-painter',
  order: 10,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { art: 'robot-painter/first-steps' },
  kind: 'sequence',
  inputs: ['click', 'drag', 'keyboard'],
  steps,
  stepsDirectory: '../../puzzles/tier-1',
  generateLevel,
  spoken: [strings.instruction],
  load: () => import('./RobotFirstStepsActivity.tsx'),
});
