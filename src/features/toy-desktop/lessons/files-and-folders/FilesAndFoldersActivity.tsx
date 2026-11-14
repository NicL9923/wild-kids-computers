import { useMemo } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { LessonDesktop } from '../harness/LessonDesktop.tsx';
import type { FilesFoldersLevel } from './level.ts';
import { filesFoldersSteps } from './steps.ts';

/** Moves a file into its folder, opens the folder, and makes and names a new folder. */
export default function FilesAndFoldersActivity({ level, band, kit }: ActivityProps<FilesFoldersLevel>) {
  const steps = useMemo(() => filesFoldersSteps(level), [level]);
  return <LessonDesktop level={level} band={band} kit={kit} steps={steps} />;
}
