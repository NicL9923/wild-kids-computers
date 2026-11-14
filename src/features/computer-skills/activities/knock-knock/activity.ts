import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_KNOCK_DIFFICULTY, type KnockLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<KnockLevel>({
  id: 'knock-knock',
  area: 'computer-skills',
  order: 60,
  bands: ['band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'door' },
  kind: 'rounds',
  inputs: ['double-click'],
  difficulty: { 'band-6-8': { min: 1, max: MAX_KNOCK_DIFFICULTY } },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction, strings.twoQuick],
  load: () => import('./KnockKnockActivity.tsx'),
});
