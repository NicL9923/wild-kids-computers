import type { ActivityProps } from '../../../../activityShell/kit.ts';
import type { Puzzle } from '../../engine/puzzle.ts';
import { RobotPainter } from '../../screen/RobotPainter.tsx';

/** One puzzle of this tier on the robot painter screen. The kit moves on when the child chooses. */
export default function RobotPatternsActivity({ level, band, kit }: ActivityProps<Puzzle>) {
  return <RobotPainter mode={{ kind: 'puzzle', puzzle: level }} band={band} kit={kit} />;
}
