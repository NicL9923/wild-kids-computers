import { useMemo } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { LessonDesktop } from '../harness/LessonDesktop.tsx';
import type { TrashLevel } from './level.ts';
import { trashSteps } from './steps.ts';

/** Puts a picture in the trash, opens the trash, and restores the picture. */
export default function TrashActivity({ level, band, kit }: ActivityProps<TrashLevel>) {
  const steps = useMemo(() => trashSteps(level), [level]);
  return <LessonDesktop level={level} band={band} kit={kit} steps={steps} />;
}
