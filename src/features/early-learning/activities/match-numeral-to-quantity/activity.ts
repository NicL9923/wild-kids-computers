import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_MATCH_DIFFICULTY, type MatchLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<MatchLevel>({
  id: 'match-numeral-to-quantity',
  area: 'early-learning',
  order: 200,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'abacus' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 5 },
    'band-6-8': { min: 3, max: MAX_MATCH_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction, strings.find],
  load: () => import('./MatchNumeralToQuantityActivity.tsx'),
});
