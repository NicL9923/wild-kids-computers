import type { ActivityProps } from '../../../../activityShell/kit.ts';
import type { FreeMode } from '../../engine/freeMode.ts';
import { RobotPainter } from '../../screen/RobotPainter.tsx';

/** Free play with the robot: no goal, and "paint it" takes the drawing to the paint studio. */
export default function RobotFreeDrawActivity({ level, band, kit }: ActivityProps<FreeMode>) {
  return <RobotPainter mode={{ kind: 'free', free: level }} band={band} kit={kit} />;
}
