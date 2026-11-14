import { useMemo, type ReactNode } from 'react';
import { useActivityState } from '../app/session/sessionHooks.ts';
import type { ActivityDefinition } from '../core/activityKit/defineActivity.ts';
import type { DocumentSpec } from '../core/storage/document.ts';
import type { ActivityStateDocument } from '../core/storage/schemas.ts';
import { ActivityNotOpened } from './ActivityNotOpened.tsx';
import type { KitState } from './kit.ts';

/**
 * Opens the activity's saved state through the session when the definition declares one, and
 * hands it to `children`. An activity without state gets null and opens no document. When the
 * saved state cannot be read, the activity does not start: the child sees the calm screen that
 * says it did not open, and trying again reads the state again. Defaults in its place would be
 * saved over the child's work.
 */
export function WithActivityState({
  definition,
  children,
}: {
  definition: ActivityDefinition;
  children: (state: KitState<unknown> | null) => ReactNode;
}) {
  if (definition.stateDocument === null) return children(null);
  return (
    <OpenState definition={definition} spec={definition.stateDocument}>
      {children}
    </OpenState>
  );
}

function OpenState({
  definition,
  spec,
  children,
}: {
  definition: ActivityDefinition;
  spec: DocumentSpec<ActivityStateDocument<unknown>>;
  children: (state: KitState<unknown>) => ReactNode;
}) {
  const { state, loaded, unreadable, update, reopen } = useActivityState(definition.id, spec);
  const kitState = useMemo<KitState<unknown>>(() => ({ value: state, loaded, update }), [state, loaded, update]);
  if (unreadable) return <ActivityNotOpened definition={definition} onTryAgain={reopen} />;
  return children(kitState);
}
