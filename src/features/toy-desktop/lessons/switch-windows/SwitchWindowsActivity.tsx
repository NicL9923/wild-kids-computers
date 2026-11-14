import { useMemo } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { LessonDesktop } from '../harness/LessonDesktop.tsx';
import type { SwitchLevel } from './level.ts';
import { switchSteps } from './steps.ts';

/** Finds a hidden window, brings it to the front, and makes it fill the screen or go away. */
export default function SwitchWindowsActivity({ level, band, kit }: ActivityProps<SwitchLevel>) {
  const steps = useMemo(() => switchSteps(level), [level]);
  return <LessonDesktop level={level} band={band} kit={kit} steps={steps} />;
}
