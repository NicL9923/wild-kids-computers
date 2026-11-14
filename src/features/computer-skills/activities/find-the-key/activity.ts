import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_KEY_DIFFICULTY, type KeyLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<KeyLevel>({
  id: 'find-the-key',
  area: 'computer-skills',
  order: 130,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'keyboard' },
  kind: 'rounds',
  inputs: ['keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 4 },
    'band-6-8': { min: 3, max: MAX_KEY_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction, strings.press],
  load: () => import('./FindTheKeyActivity.tsx'),
});
