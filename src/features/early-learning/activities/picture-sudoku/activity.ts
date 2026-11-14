import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_DIFFICULTY, type SudokuLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<SudokuLevel>({
  id: 'picture-sudoku',
  area: 'early-learning',
  order: 340,
  bands: ['band-3-5', 'band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'abacus' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 4 },
    'band-6-8': { min: 3, max: 8 },
    'band-9-12': { min: 6, max: MAX_DIFFICULTY },
  },
  roundsPerSession: 3,
  generateLevel,
  spoken: [strings.instruction, strings.boxes],
  load: () => import('./PictureSudokuActivity.tsx'),
});
