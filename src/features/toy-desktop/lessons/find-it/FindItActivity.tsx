import { useMemo } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { LessonDesktop } from '../harness/LessonDesktop.tsx';
import type { FindItLevel } from './level.ts';
import { findItSteps } from './steps.ts';

/** Finds a file by name with the file explorer's search box, then opens it. */
export default function FindItActivity({ level, band, kit }: ActivityProps<FindItLevel>) {
  const steps = useMemo(() => findItSteps(level), [level]);
  return <LessonDesktop level={level} band={band} kit={kit} steps={steps} />;
}
