import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, type FindItLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<FindItLevel>({
  id: 'find-it',
  area: 'toy-desktop',
  order: 110,
  bands: ['band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'magnifying-glass' },
  kind: 'rounds',
  inputs: ['click', 'keyboard', 'text-entry'],
  difficulty: {
    'band-9-12': { min: 1, max: 6 },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [
    strings.instruction,
    strings.findKitePlan,
    strings.findOwlFacts,
    strings.findCakeRecipe,
    strings.findFrogSong,
    strings.findMoonDance,
    strings.findBoatTrip,
    strings.findRedTractor,
    strings.findFoxDen,
    strings.openIt,
  ],
  load: () => import('./FindItActivity.tsx'),
});
