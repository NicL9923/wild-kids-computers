import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, type MenusLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<MenusLevel>({
  id: 'menus',
  area: 'toy-desktop',
  order: 40,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'clipboard' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-6-8': { min: 1, max: 5 },
    'band-9-12': { min: 3, max: 7 },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [
    strings.instruction,
    strings.inMenu,
    strings.choose,
    strings.findCommand,
    strings.nowInMenu,
    strings.nowFind,
    strings.otherCommand,
  ],
  load: () => import('./MenusActivity.tsx'),
});
