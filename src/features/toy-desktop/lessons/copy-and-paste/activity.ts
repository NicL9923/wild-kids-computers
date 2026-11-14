import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, type CopyPasteLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<CopyPasteLevel>({
  id: 'copy-and-paste',
  area: 'toy-desktop',
  order: 80,
  bands: ['band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'clipboard' },
  kind: 'rounds',
  inputs: ['click', 'keyboard'],
  difficulty: {
    'band-6-8': { min: 1, max: 3 },
    'band-9-12': { min: 2, max: 4 },
  },
  roundsPerSession: 4,
  generateLevel,
  spoken: [
    strings.instruction,
    strings.calculatorCopy,
    strings.notePaste,
    strings.noteSelect,
    strings.noteCopy,
    strings.calculatorPaste,
    strings.calculatorCopyCtrl,
    strings.notePasteCtrl,
    strings.noteSelectCtrl,
    strings.noteCopyCtrl,
    strings.calculatorPasteCtrl,
    strings.calculatorCopyCmd,
    strings.notePasteCmd,
    strings.noteSelectCmd,
    strings.noteCopyCmd,
    strings.calculatorPasteCmd,
  ],
  load: () => import('./CopyAndPasteActivity.tsx'),
});
