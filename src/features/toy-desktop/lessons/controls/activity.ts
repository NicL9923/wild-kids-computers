import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, type ControlsLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<ControlsLevel>({
  id: 'controls',
  area: 'toy-desktop',
  order: 100,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'gear' },
  kind: 'rounds',
  inputs: ['click', 'keyboard', 'scroll', 'text-entry'],
  difficulty: {
    'band-6-8': { min: 1, max: 6 },
    'band-9-12': { min: 3, max: 8 },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [
    strings.instruction,
    strings.namesOn,
    strings.namesOff,
    strings.chooseBackground,
    strings.chooseIconSize,
    strings.brightnessLowest,
    strings.brightnessMiddle,
    strings.typeName,
    strings.chooseSound,
    strings.fox,
    strings.owl,
    strings.frog,
    strings.bee,
    strings.otherChoice,
  ],
  load: () => import('./ControlsActivity.tsx'),
});
