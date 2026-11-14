import { useMemo } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { usePlatformOs } from '../../desktop/usePlatformOs.ts';
import { LessonDesktop } from '../harness/LessonDesktop.tsx';
import type { CopyPasteLevel } from './level.ts';
import { copyPasteSteps } from './steps.ts';

/** Copies a number from one toy app and pastes it into the other, with the toy clipboard only. */
export default function CopyAndPasteActivity({ level, band, kit }: ActivityProps<CopyPasteLevel>) {
  // Shortcut steps name the modifier key of the child's own computer.
  const os = usePlatformOs();
  const steps = useMemo(() => copyPasteSteps(level, os), [level, os]);
  return <LessonDesktop level={level} band={band} kit={kit} steps={steps} />;
}
