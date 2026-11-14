import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_DIFFICULTY, type AnimalHomesLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<AnimalHomesLevel>({
  id: 'animal-homes',
  area: 'early-learning',
  order: 270,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'nest' },
  kind: 'rounds',
  inputs: ['click', 'drag', 'keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 4 },
    'band-6-8': { min: 3, max: MAX_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [
    strings.instruction,
    strings.hive,
    strings.web,
    strings.pond,
    strings.ocean,
    strings.cave,
    strings.burrow,
    strings.barn,
    strings.ice,
    strings.desert,
  ],
  load: () => import('./AnimalHomesActivity.tsx'),
});
