import { useMemo } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { LessonDesktop } from '../harness/LessonDesktop.tsx';
import type { OpenCloseLevel } from './level.ts';
import { openCloseSteps } from './steps.ts';

/** Opens the named app from its desktop icon, then closes its window. */
export default function OpenAndCloseActivity({ level, band, kit }: ActivityProps<OpenCloseLevel>) {
  const steps = useMemo(() => openCloseSteps(level), [level]);
  return <LessonDesktop level={level} band={band} kit={kit} steps={steps} />;
}
