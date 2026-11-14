import { useMemo } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { LessonDesktop } from '../harness/LessonDesktop.tsx';
import type { MenusLevel } from './level.ts';
import { menuSteps } from './steps.ts';

/** Opens a menu in the menu bar and chooses the command it hears. */
export default function MenusActivity({ level, band, kit }: ActivityProps<MenusLevel>) {
  const steps = useMemo(() => menuSteps(level), [level]);
  return <LessonDesktop level={level} band={band} kit={kit} steps={steps} />;
}
