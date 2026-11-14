import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { desktopStateSchema } from '../../model/schema.ts';
import { sampleDesktop } from '../../model/sampleContent.ts';
import type { DesktopState } from '../../model/state.ts';
import { generateLevel, type FreePlayLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<FreePlayLevel, DesktopState>({
  id: 'toy-desktop-free-play',
  area: 'toy-desktop',
  // After the lessons, which take 10 to 140.
  order: 200,
  bands: ['band-3-5', 'band-6-8', 'band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'laptop' },
  kind: 'free',
  inputs: ['click', 'drag', 'keyboard', 'text-entry'],
  generateLevel,
  // The child's own desktop, saved per profile. Bad saved data falls back to the sample desktop.
  state: { schema: desktopStateSchema, defaults: sampleDesktop },
  spoken: [strings.instruction],
  load: () => import('./ToyDesktopFreePlayActivity.tsx'),
});
