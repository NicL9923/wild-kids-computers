import { useMemo } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { LessonDesktop } from '../harness/LessonDesktop.tsx';
import type { SaveOpenLevel } from './level.ts';
import { saveOpenSteps } from './steps.ts';

/** Saves a note with a name, closes the notepad, and opens the note again. */
export default function SaveAndOpenActivity({ level, band, kit }: ActivityProps<SaveOpenLevel>) {
  const steps = useMemo(() => saveOpenSteps(level), [level]);
  return <LessonDesktop level={level} band={band} kit={kit} steps={steps} />;
}
