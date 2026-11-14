import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, MAX_DIFFICULTY, type TellTheTimeLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<TellTheTimeLevel>({
  id: 'tell-the-time',
  area: 'early-learning',
  order: 250,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'alarm-clock' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-6-8': { min: 1, max: 6 },
    'band-9-12': { min: 4, max: MAX_DIFFICULTY },
  },
  roundsPerSession: 5,
  generateLevel,
  spoken: [
    strings.whatTime,
    strings.setTo,
    strings.oclock,
    strings.halfPast,
    strings.quarterPast,
    strings.quarterTo,
    strings.oh,
    strings.hourBack,
    strings.hourForward,
    strings.minuteBack,
    strings.minuteForward,
    strings.check,
  ],
  load: () => import('./TellTheTimeActivity.tsx'),
});
