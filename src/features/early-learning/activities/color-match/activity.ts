import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_DIFFICULTY, type ColorMatchLevel } from './level.ts';
import { colorMatchDefaults, colorMatchStateSchema, type ColorMatchState } from './state.ts';
import { strings } from './strings.ts';

export default defineActivity<ColorMatchLevel, ColorMatchState>({
  id: 'color-match',
  area: 'early-learning',
  order: 200,
  bands: ['band-3-5'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'paint-palette' },
  kind: 'rounds',
  inputs: ['click', 'drag', 'keyboard'],
  difficulty: { 'band-3-5': { min: 1, max: MAX_DIFFICULTY } },
  roundsPerSession: 4,
  generateLevel,
  // Whether colors also show patterns, for a child who sees some colors alike.
  state: { schema: colorMatchStateSchema, defaults: colorMatchDefaults },
  spoken: [strings.instruction],
  load: () => import('./ColorMatchActivity.tsx'),
});
