import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_MEADOW_DIFFICULTY, type MeadowLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<MeadowLevel>({
  id: 'wake-the-meadow',
  area: 'computer-skills',
  order: 10,
  bands: ['band-3-5'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'tulip' },
  kind: 'rounds',
  inputs: ['pointer-move'],
  difficulty: { 'band-3-5': { min: 1, max: MAX_MEADOW_DIFFICULTY } },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction],
  load: () => import('./WakeTheMeadowActivity.tsx'),
});
