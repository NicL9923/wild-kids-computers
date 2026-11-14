import { EARLY_WINDOW, STAND_GAP, type JumpLevel, type Stop } from './level.ts';

/**
 * The critter's walk as a pure state machine, so the component only draws it and the unit test
 * can step it. `advance` moves time forward; `press` answers Space or Enter.
 */

export const JUMP_MS = 650;
export const OPEN_MS = 500;
/** How high a jump goes, in path units. */
const JUMP_HEIGHT = 120;

type Phase = 'walking' | 'waiting' | 'jumping' | 'opening' | 'home';

export interface WalkState {
  readonly x: number;
  /** The index of the stop the critter is heading for. */
  readonly stop: number;
  readonly phase: Phase;
  /** Time spent in a jump or an opening, in milliseconds. */
  readonly elapsed: number;
  /** Where a jump started. */
  readonly from: number;
}

export function startWalk(startX: number): WalkState {
  return { x: startX, stop: 0, phase: 'walking', elapsed: 0, from: startX };
}

export const standX = (stop: Stop) => stop.x - STAND_GAP;
export const landX = (stop: Stop) => stop.x + STAND_GAP;

function stopAt(level: JumpLevel, index: number): Stop {
  const stop = level.stops[index];
  if (stop === undefined) throw new RangeError(`The walk has no stop ${String(index)}.`);
  return stop;
}

/**
 * Moves the walk on by `ms`. With `instant`, for reduced motion, every move finishes at once:
 * the critter appears at the next place to stand instead of gliding there.
 */
export function advance(state: WalkState, level: JumpLevel, ms: number, instant: boolean): WalkState {
  if (state.phase === 'waiting' || state.phase === 'home') return state;
  const stop = stopAt(level, state.stop);
  if (state.phase === 'walking') {
    const target = standX(stop);
    const x = instant ? target : Math.min(target, state.x + (level.speed * ms) / 1000);
    return x >= target ? { ...state, x: target, phase: 'waiting' } : { ...state, x };
  }
  const elapsed = state.elapsed + ms;
  if (state.phase === 'jumping') {
    if (instant || elapsed >= JUMP_MS)
      return { ...state, x: landX(stop), stop: state.stop + 1, phase: 'walking', elapsed: 0 };
    return { ...state, elapsed, x: state.from + ((landX(stop) - state.from) * elapsed) / JUMP_MS };
  }
  // Opening a gate or the door of home.
  if (!instant && elapsed < OPEN_MS) return { ...state, elapsed };
  if (stop.kind === 'home') return { ...state, phase: 'home', elapsed: 0 };
  return { ...state, stop: state.stop + 1, phase: 'walking', elapsed: 0 };
}

/** How high the critter is now, in path units: an arc during a jump, the ground otherwise. */
export function heightOf(state: WalkState): number {
  if (state.phase !== 'jumping') return 0;
  const t = Math.min(1, state.elapsed / JUMP_MS);
  return JUMP_HEIGHT * 4 * t * (1 - t);
}

/** Whether the right key works now: while waiting, or close to the stop when it keeps walking. */
export function isNear(state: WalkState, level: JumpLevel): boolean {
  if (state.phase === 'waiting') return true;
  if (state.phase !== 'walking' || level.walk !== 'keeps-walking') return false;
  return standX(stopAt(level, state.stop)) - state.x <= EARLY_WINDOW;
}

/**
 * - `go`: the right key near the stop; the critter jumps or the door opens.
 * - `hop`: Space away from a jump; the critter hops in place, which is harmless.
 * - `wrong`: the other key at a stop. The child hears which key to use.
 * - `none`: nothing happens.
 */
export type PressResult = 'go' | 'hop' | 'wrong' | 'none';

export function press(
  state: WalkState,
  level: JumpLevel,
  key: 'space' | 'enter',
): { state: WalkState; result: PressResult } {
  if (state.phase !== 'walking' && state.phase !== 'waiting') return { state, result: 'none' };
  const stop = stopAt(level, state.stop);
  const wanted = stop.kind === 'jump' ? 'space' : 'enter';
  const near = isNear(state, level);
  if (key === wanted && near) {
    return {
      state: { ...state, phase: stop.kind === 'jump' ? 'jumping' : 'opening', elapsed: 0, from: state.x },
      result: 'go',
    };
  }
  if (near && state.phase === 'waiting') return { state, result: 'wrong' };
  return { state, result: key === 'space' ? 'hop' : 'none' };
}
