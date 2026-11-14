import { useEffect, useState } from 'react';
import { createScope, type OwnedScope, type Scope } from '../core/activityKit/scope.ts';
import type { Scheduler } from '../core/activityKit/scheduler.ts';
import { kitScheduler } from './kitTime.ts';

/** A scope that a component owns while it is mounted, and opens again if React mounts it again. */
export interface ScopeLifetime {
  /** Stable for the component's life. Every call goes to the scope that is open now. */
  readonly scope: Scope;
  /** Opens a fresh scope if the last one was disposed. */
  open(): void;
  /** Disposes the open scope, cancelling everything it owns. */
  close(): void;
}

export function createScopeLifetime(scheduler: Scheduler): ScopeLifetime {
  let current: OwnedScope = createScope(scheduler);
  const scope: Scope = {
    get disposed() {
      return current.disposed;
    },
    setTimeout: (callback, ms) => current.setTimeout(callback, ms),
    setInterval: (callback, ms) => current.setInterval(callback, ms),
    requestFrame: (callback) => current.requestFrame(callback),
    listen: (target, type, listener, options) => current.listen(target, type, listener, options),
    own: (cleanup) => current.own(cleanup),
  };
  return {
    scope,
    open() {
      if (current.disposed) current = createScope(scheduler);
    },
    close() {
      current.dispose();
    },
  };
}

/**
 * A scope that lives as long as the component that calls this. Unmounting cancels everything
 * it owns. React's development double mount gets a fresh scope instead of a disposed one.
 */
export function useScope(): Scope {
  const [lifetime] = useState(() => createScopeLifetime(kitScheduler));
  useEffect(() => {
    lifetime.open();
    return () => lifetime.close();
  }, [lifetime]);
  return lifetime.scope;
}
