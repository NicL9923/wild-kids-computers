import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_DIAL_DIFFICULTY, type DialsLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<DialsLevel>({
  id: 'sliders-and-dials',
  area: 'computer-skills',
  order: 100,
  bands: ['band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'radio' },
  kind: 'rounds',
  inputs: ['drag', 'click', 'keyboard'],
  difficulty: { 'band-6-8': { min: 1, max: MAX_DIAL_DIFFICULTY } },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction, strings.lookForFlag],
  load: () => import('./SlidersAndDialsActivity.tsx'),
});
