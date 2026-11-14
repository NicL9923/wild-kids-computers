import { useMemo } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { LessonDesktop } from '../harness/LessonDesktop.tsx';
import type { FixItLevel } from './level.ts';
import { fixSteps } from './steps.ts';

/** Fixes small problems on the toy computer: sound off, and windows minimized, hidden, or off the edge. */
export default function FixItActivity({ level, band, kit }: ActivityProps<FixItLevel>) {
  const steps = useMemo(() => fixSteps(level), [level]);
  return <LessonDesktop level={level} band={band} kit={kit} steps={steps} />;
}
