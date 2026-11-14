import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_WORD_DIFFICULTY, type TypeWordLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<TypeWordLevel>({
  id: 'type-the-word',
  area: 'computer-skills',
  order: 160,
  bands: ['band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'pencil' },
  kind: 'rounds',
  inputs: ['keyboard', 'text-entry'],
  difficulty: { 'band-6-8': { min: 1, max: MAX_WORD_DIFFICULTY } },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction, strings.type],
  load: () => import('./TypeTheWordActivity.tsx'),
});
