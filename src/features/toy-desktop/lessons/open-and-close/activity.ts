import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, type OpenCloseLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<OpenCloseLevel>({
  id: 'open-and-close',
  area: 'toy-desktop',
  order: 10,
  bands: ['band-3-5', 'band-6-8'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'window' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-3-5': { min: 1, max: 4 },
    'band-6-8': { min: 3, max: 8 },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [
    strings.instruction,
    strings.openNotepad,
    strings.openPictureViewer,
    strings.openFileExplorer,
    strings.openMusicBox,
    strings.openCalculator,
    strings.close,
  ],
  load: () => import('./OpenAndCloseActivity.tsx'),
});
