import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_TRAIL_DIFFICULTY, type TrailLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<TrailLevel>({
  id: 'follow-the-trail',
  area: 'computer-skills',
  order: 20,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'footprints' },
  kind: 'rounds',
  inputs: ['pointer-move'],
  difficulty: {
    'band-3-5': { min: 1, max: 5 },
    'band-6-8': { min: 3, max: MAX_TRAIL_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [strings.instruction, strings.findTheBug],
  load: () => import('./FollowTheTrailActivity.tsx'),
});
