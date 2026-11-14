import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityKit } from '../../../activityShell/kit.ts';
import type { Band } from '../../../core/bands.ts';
import type { Segment } from '../engine/geometry.ts';
import {
  runProgram,
  stepProgram,
  type RobotState,
  type RunResult,
  type RunStep,
  type World,
} from '../engine/interpreter.ts';
import type { ValidProgram } from '../engine/validate.ts';
import { stepPause } from '../timing.ts';
import type { StageBump } from './RobotStage.tsx';

/**
 * Runs a program on the stage one step at a time through the kit scope, so leaving the activity
 * stops the robot. The view says where the robot is, what it drew, and which block is running.
 */

export interface RunView {
  readonly robot: RobotState;
  readonly drawing: readonly Segment[];
  /** The block running now, and the repeat, call, and define blocks around it. */
  readonly active: { readonly blockId: string; readonly within: readonly string[] } | null;
  readonly bump: StageBump | null;
}

/**
 * - `idle`: the robot stands at the start, ready.
 * - `running`: stepping on its own.
 * - `paused`: part way, moved by "one step".
 * - `ended`: the run reached its end; the robot stays where it stopped.
 */
export type RunStatus = 'idle' | 'running' | 'paused' | 'ended';

export interface RobotRun {
  readonly view: RunView;
  readonly status: RunStatus;
  /** The pause between steps of the current run, which the stage glides over. */
  readonly pause: number;
  /** Runs the program to the end, or on from where "one step" left it. */
  run(program: ValidProgram, onEnd: (result: RunResult) => void): void;
  /** Runs one step. Calls onEnd instead when the program has no step left. */
  stepOnce(program: ValidProgram, onEnd: (result: RunResult) => void): void;
  /** Shows a whole program's result at once, gliding only its last step. For arrows that run at once. */
  show(program: ValidProgram): RunResult;
  /** Stops and puts the robot back at the start with clean paper. */
  reset(): void;
}

function startView(world: World): RunView {
  return { robot: world.start, drawing: [], active: null, bump: null };
}

export function useRobotRun(kit: Pick<ActivityKit<unknown>, 'scope' | 'play'>, world: World, band: Band): RobotRun {
  const [view, setView] = useState<RunView>(() => startView(world));
  const [status, setStatus] = useState<RunStatus>('idle');
  const [pause, setPause] = useState(() => stepPause(1, band));
  const steps = useRef<Generator<RunStep, RunResult> | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  const bumps = useRef(0);
  const { scope, play } = kit;

  const stop = useCallback(() => {
    cancel.current?.();
    cancel.current = null;
  }, []);

  const toView = useCallback(
    (step: RunStep): RunView => {
      let bump: StageBump | null = null;
      if (step.event.kind === 'bumped') {
        bumps.current += 1;
        bump = { key: bumps.current, at: { x: step.robot.x, y: step.robot.y }, blocked: step.event.blocked };
        play('nudge');
      }
      return { robot: step.robot, drawing: step.drawing, active: { blockId: step.blockId, within: step.within }, bump };
    },
    [play],
  );

  /** The generator for this run, made on the first step with the pause for its length. */
  const begin = useCallback(
    (program: ValidProgram): Generator<RunStep, RunResult> => {
      if (steps.current !== null) return steps.current;
      const made = stepProgram(program, world);
      steps.current = made;
      return made;
    },
    [world],
  );

  const finish = useCallback((result: RunResult, onEnd: (result: RunResult) => void) => {
    steps.current = null;
    cancel.current = null;
    setStatus('ended');
    setView((current) => ({ ...current, active: null }));
    onEnd(result);
  }, []);

  const run = useCallback(
    (program: ValidProgram, onEnd: (result: RunResult) => void) => {
      stop();
      const generator = begin(program);
      const wait = stepPause(runProgram(program, world).steps, band);
      setPause(wait);
      setStatus('running');
      const tick = () => {
        const next = generator.next();
        if (next.done === true) {
          finish(next.value, onEnd);
          return;
        }
        setView(toView(next.value));
        cancel.current = scope.setTimeout(tick, wait);
      };
      tick();
    },
    [band, begin, finish, scope, stop, toView, world],
  );

  const stepOnce = useCallback(
    (program: ValidProgram, onEnd: (result: RunResult) => void) => {
      stop();
      const next = begin(program).next();
      if (next.done === true) {
        finish(next.value, onEnd);
        return;
      }
      setPause(stepPause(1, band));
      setStatus('paused');
      setView(toView(next.value));
    },
    [band, begin, finish, stop, toView],
  );

  const show = useCallback(
    (program: ValidProgram): RunResult => {
      stop();
      steps.current = null;
      const generator = stepProgram(program, world);
      let last: RunStep | null = null;
      let next = generator.next();
      for (; next.done !== true; next = generator.next()) last = next.value;
      setPause(stepPause(1, band));
      setStatus('idle');
      setView(last === null ? startView(world) : { ...toView(last), active: null });
      return next.value;
    },
    [band, stop, toView, world],
  );

  const reset = useCallback(() => {
    stop();
    steps.current = null;
    setStatus('idle');
    setView(startView(world));
  }, [stop, world]);

  // Leaving stops the robot. The scope would cancel the timer too; this keeps the ref honest.
  useEffect(() => stop, [stop]);

  return { view, status, pause, run, stepOnce, show, reset };
}
