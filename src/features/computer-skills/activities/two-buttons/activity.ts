import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_BUTTONS_DIFFICULTY, type ButtonsLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<ButtonsLevel>({
  id: 'two-buttons',
  area: 'computer-skills',
  order: 70,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'computer-mouse' },
  kind: 'rounds',
  inputs: ['click', 'right-click'],
  difficulty: {
    'band-6-8': { min: 1, max: 6 },
    'band-9-12': { min: 4, max: MAX_BUTTONS_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction, strings.trackpad, strings.useLeft, strings.useRight],
  load: () => import('./TwoButtonsActivity.tsx'),
});
