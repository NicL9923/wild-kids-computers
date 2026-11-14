import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, type SaveOpenLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<SaveOpenLevel>({
  id: 'save-and-open',
  area: 'toy-desktop',
  order: 70,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'save-disk' },
  kind: 'rounds',
  inputs: ['click', 'keyboard', 'text-entry'],
  difficulty: {
    'band-6-8': { min: 1, max: 5 },
    'band-9-12': { min: 3, max: 8 },
  },
  roundsPerSession: 3,
  generateLevel,
  spoken: [strings.instruction, strings.save, strings.name, strings.nameInNotes, strings.close, strings.reopen],
  load: () => import('./SaveAndOpenActivity.tsx'),
});
