import { useMemo } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import type { Rect } from '../../model/geometry.ts';
import { LessonDesktop, type LessonView } from '../harness/LessonDesktop.tsx';
import type { MoveResizeLevel } from './level.ts';
import { moveResizeSteps } from './steps.ts';
import './moveAndResize.css';

/** A dashed box on the desktop, under the window, with a dot on the corner the window lines up by. */
function Mark({ rect, scale, step }: { readonly rect: Rect; readonly scale: number; readonly step: string }) {
  return (
    <div
      className='mr-mark'
      aria-hidden='true'
      data-mark={step}
      style={{ left: rect.x * scale, top: rect.y * scale, width: rect.width * scale, height: rect.height * scale }}
    >
      <span className='mr-corner' data-corner='top-left' />
      <span className='mr-corner' data-corner='bottom-right' />
    </div>
  );
}

/** Moves a window into a dashed box by its title bar, then resizes it by its corner to fit another. */
export default function MoveAndResizeActivity({ level, band, kit }: ActivityProps<MoveResizeLevel>) {
  const steps = useMemo(() => moveResizeSteps(level), [level]);
  const backdrop = ({ scale, step }: LessonView) => {
    if (step === 0) return <Mark rect={level.place} scale={scale} step='place' />;
    return <Mark rect={level.outline} scale={scale} step='outline' />;
  };
  return <LessonDesktop level={level} band={band} kit={kit} steps={steps} backdrop={backdrop} />;
}
