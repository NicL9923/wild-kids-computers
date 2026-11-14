import { useCallback, useMemo, useRef, useState } from 'react';
import { toyClipboard } from '../../../app/inputGuards.ts';
import { reduce, type DesktopAction, type DesktopEnv, type Transition } from '../model/desktop.ts';
import type { DesktopState } from '../model/state.ts';

/** Called after every action with what happened. */
type DesktopListener = (transition: Transition, action: DesktopAction) => void;

/**
 * A running toy desktop: the state now, and `dispatch`, which applies an action through the
 * model's reducer at once and returns what happened. Lessons and the desktop screen `listen` to
 * every transition, so each one sees the same events whatever the child used.
 */
export interface DesktopHandle {
  readonly state: DesktopState;
  /** Applies one action. Call it from event handlers, never during a render. */
  readonly dispatch: (action: DesktopAction) => Transition;
  /** The state after the last dispatch, even before React renders it. */
  readonly current: () => DesktopState;
  /** Swaps in another state, such as a saved desktop that finished loading. No events. */
  readonly replace: (state: DesktopState) => void;
  /** Hears every transition. Returns a function that stops listening. */
  readonly listen: (listener: DesktopListener) => () => void;
}

/** The app's one toy clipboard. Nothing in the toy desktop ever reaches the system clipboard. */
const APP_ENV: DesktopEnv = { clipboard: toyClipboard };

export function useDesktop(initial: () => DesktopState, env: DesktopEnv = APP_ENV): DesktopHandle {
  const [state, setState] = useState(initial);
  // The newest state, so two dispatches in one handler build on each other.
  const live = useRef(state);
  const listeners = useRef(new Set<DesktopListener>());
  const envRef = useRef(env);

  const dispatch = useCallback((action: DesktopAction): Transition => {
    const transition = reduce(live.current, action, envRef.current);
    if (transition.state !== live.current) {
      live.current = transition.state;
      setState(transition.state);
    }
    for (const listener of listeners.current) listener(transition, action);
    return transition;
  }, []);

  const replace = useCallback((next: DesktopState) => {
    live.current = next;
    setState(next);
  }, []);

  const listen = useCallback((listener: DesktopListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const current = useCallback(() => live.current, []);

  return useMemo(() => ({ state, current, dispatch, replace, listen }), [state, current, dispatch, replace, listen]);
}
