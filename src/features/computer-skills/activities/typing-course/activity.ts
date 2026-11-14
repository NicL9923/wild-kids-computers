import { defineActivity } from '../../../../core/activityKit/defineActivity.ts';
import { LESSONS, type Lesson } from './lessons.ts';
import { generateLevel, type TypingLevel } from './level.ts';
import { strings } from './strings.ts';

export default defineActivity<TypingLevel, never, Lesson>({
  id: 'typing-course',
  area: 'computer-skills',
  order: 190,
  bands: ['band-9-12'],
  goal: strings.goal,
  title: strings.title,
  icon: { emoji: 'keyboard' },
  kind: 'sequence',
  inputs: ['keyboard'],
  steps: LESSONS,
  stepsDirectory: null,
  generateLevel,
  spoken: [strings.instruction, strings.newKeys, strings.newKeyShift, strings.practice, strings.lineDone],
  load: () => import('./TypingCourseActivity.tsx'),
});
