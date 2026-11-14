import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, type UndoRedoLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<UndoRedoLevel>({
  id: 'undo-and-redo',
  area: 'toy-desktop',
  order: 90,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { art: 'undo-and-redo/undo-redo' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-6-8': { min: 1, max: 4 },
    'band-9-12': { min: 3, max: 6 },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [
    strings.instruction,
    strings.undoWord,
    strings.undoDot,
    strings.undoDotNext,
    strings.redo,
    strings.undoWordCtrl,
    strings.undoDotCtrl,
    strings.undoDotNextCtrl,
    strings.redoCtrl,
    strings.undoWordCmd,
    strings.undoDotCmd,
    strings.undoDotNextCmd,
    strings.redoCmd,
  ],
  load: () => import('./UndoAndRedoActivity.tsx'),
});
