import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, type SwitchLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<SwitchLevel>({
  id: 'switch-windows',
  area: 'toy-desktop',
  order: 30,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'window' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-6-8': { min: 1, max: 6 },
    'band-9-12': { min: 3, max: 7 },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [
    strings.instruction,
    strings.findNotepad,
    strings.findPictureViewer,
    strings.findFileExplorer,
    strings.findMusicBox,
    strings.findCalculator,
    strings.maximize,
    strings.minimize,
    strings.lookAtStrip,
  ],
  load: () => import('./SwitchWindowsActivity.tsx'),
});
