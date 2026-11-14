import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_JUMP_DIFFICULTY, type JumpLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<JumpLevel>({
  id: 'space-and-enter',
  area: 'computer-skills',
  order: 150,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'frog' },
  kind: 'rounds',
  inputs: ['keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 4 },
    'band-6-8': { min: 3, max: MAX_JUMP_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [
    strings.instruction,
    strings.pressSpace,
    strings.pressEnterGate,
    strings.pressEnterHome,
    strings.spaceIsLong,
    strings.enterIsBig,
  ],
  load: () => import('./SpaceAndEnterActivity.tsx'),
});
