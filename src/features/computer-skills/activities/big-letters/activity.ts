import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_SHIFT_DIFFICULTY, type ShiftLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<ShiftLevel>({
  id: 'big-letters',
  area: 'computer-skills',
  order: 170,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'keyboard' },
  kind: 'rounds',
  inputs: ['keyboard'],
  difficulty: {
    'band-6-8': { min: 1, max: 6 },
    'band-9-12': { min: 3, max: MAX_SHIFT_DIFFICULTY },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [
    strings.instruction,
    strings.holdShiftType,
    strings.type,
    strings.capital,
    strings.holdShift,
    strings.letGo,
    strings.capsLock,
  ],
  load: () => import('./BigLettersActivity.tsx'),
});
