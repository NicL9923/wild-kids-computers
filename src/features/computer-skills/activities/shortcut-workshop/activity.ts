import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { generateLevel, type WorkshopLevel } from './level.ts';
import { STEPS, type WorkshopStep } from './steps.ts';
import { strings } from './strings.ts';

export default defineActivity<WorkshopLevel, never, WorkshopStep>({
  id: 'shortcut-workshop',
  area: 'computer-skills',
  order: 200,
  bands: ['band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'scissors' },
  kind: 'sequence',
  inputs: ['keyboard', 'text-entry'],
  steps: STEPS,
  stepsDirectory: null,
  generateLevel,
  spoken: [strings.instruction, strings.stepSelectAll, strings.selectAllCtrl, strings.selectAllCmd],
  load: () => import('./ShortcutWorkshopActivity.tsx'),
});
