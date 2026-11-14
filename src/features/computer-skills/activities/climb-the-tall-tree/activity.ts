import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_TREE_DIFFICULTY, type TreeLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<TreeLevel>({
  id: 'climb-the-tall-tree',
  area: 'computer-skills',
  order: 80,
  bands: ['band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'tree' },
  kind: 'rounds',
  inputs: ['scroll', 'click', 'keyboard'],
  difficulty: { 'band-6-8': { min: 1, max: MAX_TREE_DIFFICULTY } },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction, strings.find, strings.higher, strings.lower],
  load: () => import('./ClimbTheTallTreeActivity.tsx'),
});
