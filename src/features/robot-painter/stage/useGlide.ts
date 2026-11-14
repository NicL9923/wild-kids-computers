import { useEffect, useRef, useState } from 'react';
import type { KitClock } from '../../../core/activityKit/scheduler.ts';
import type { Scope } from '../../../core/activityKit/scope.ts';

/** Where the robot shows: a point and a turn in degrees, kept continuous across whole turns. */
export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

/** Fast at the start and gentle at the end, like a toy rolling to a stop. */
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/**
 * Glides the shown pose to `target` over `ms`, frame by frame through the kit scope, so leaving
 * stops it and a pinned test clock steps it. `progress` runs from 0 to 1 over the glide, for the
 * newest line to draw itself. With `ms` 0, as under reduced motion, the pose jumps at once.
 */
export function useGlide(
  scope: Pick<Scope, 'requestFrame'>,
  clock: KitClock,
  target: Pose,
  ms: number,
): { pose: Pose; progress: number } {
  const [state, setState] = useState({ pose: target, progress: 1 });
  const shown = useRef(target);
  const { x, y, angle } = target;

  useEffect(() => {
    const goal = { x, y, angle };
    const from = shown.current;
    if (ms <= 0 || (from.x === x && from.y === y && from.angle === angle)) {
      shown.current = goal;
      setState({ pose: goal, progress: 1 });
      return undefined;
    }
    const start = clock.monotonic();
    let cancel = (): void => undefined;
    const frame = () => {
      const t = Math.min(1, (clock.monotonic() - start) / ms);
      const e = easeOut(t);
      const pose = {
        x: from.x + (x - from.x) * e,
        y: from.y + (y - from.y) * e,
        angle: from.angle + (angle - from.angle) * e,
      };
      shown.current = pose;
      setState({ pose, progress: t });
      if (t < 1) cancel = scope.requestFrame(frame);
    };
    setState({ pose: from, progress: 0 });
    cancel = scope.requestFrame(frame);
    return () => cancel();
  }, [x, y, angle, ms, scope, clock]);

  return state;
}
