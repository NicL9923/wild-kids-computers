import { useMemo } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { usePlatformOs } from '../../desktop/usePlatformOs.ts';
import { LessonDesktop } from '../harness/LessonDesktop.tsx';
import type { UndoRedoLevel } from './level.ts';
import { undoRedoSteps } from './steps.ts';

/** Takes back the last change with Undo and brings it back with Redo, in the notepad and the music box. */
export default function UndoAndRedoActivity({ level, band, kit }: ActivityProps<UndoRedoLevel>) {
  // Shortcut steps name the modifier key of the child's own computer.
  const os = usePlatformOs();
  const steps = useMemo(() => undoRedoSteps(level, os), [level, os]);
  return <LessonDesktop level={level} band={band} kit={kit} steps={steps} />;
}
